// Run npm run build first: this reads the built plugin from dist.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseMarkerLine } from './helpers/corpus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distCjsPath = path.join(projectRoot, 'dist/index.cjs');
const factoriesDir = path.join(__dirname, 'fixtures/factories');

const require = createRequire(import.meta.url);

interface BuiltRule {
  meta: { schema?: unknown; docs?: { requiresTypeChecking?: boolean } };
}

interface BuiltPlugin {
  rules: Record<string, BuiltRule>;
}

function newestMtimeMs(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    newest = Math.max(newest, stat.isDirectory() ? newestMtimeMs(full) : stat.mtimeMs);
  }
  return newest;
}

function acceptsFactoryOptions(rule: BuiltRule): boolean {
  return JSON.stringify(rule.meta.schema ?? []).includes('additionalCoroutineFactories');
}

function baselineMarkers(text: string): Array<{ line: number; ruleId: string }> {
  const result: Array<{ line: number; ruleId: string }> = [];
  text.split('\n').forEach((lineText, index) => {
    const match = /\/\/\s*lint-baseline:\s*([a-zA-Z0-9_,-]+)/.exec(lineText);
    if (match) {
      for (const ruleId of match[1].split(',')) {
        result.push({ line: index + 1, ruleId });
      }
    }
  });
  return result;
}

function lintMarkers(text: string): Array<{ line: number; ruleId: string }> {
  return text
    .split('\n')
    .flatMap((lineText, index) => parseMarkerLine(lineText, index + 1))
    .map(({ line, ruleId }) => ({ line, ruleId }));
}

function pairs(items: Array<{ line: number; ruleId: string }>): string[] {
  return items.map((item) => `${item.ruleId}@${item.line}`).sort();
}

const files = readdirSync(factoriesDir)
  .filter((entry) => entry.endsWith('.ts'))
  .sort();

describe('coroutine factories smoke over the built plugin', () => {
  let plugin: BuiltPlugin;
  const summary: string[] = [];

  beforeAll(() => {
    if (!existsSync(distCjsPath)) {
      throw new Error('stale dist: dist/index.cjs missing, run npm run build');
    }
    if (statSync(distCjsPath).mtimeMs < newestMtimeMs(path.join(projectRoot, 'src'))) {
      throw new Error('stale dist: dist/index.cjs is older than src, run npm run build');
    }
    const mod = require(distCjsPath) as BuiltPlugin & { default?: BuiltPlugin };
    plugin = mod.default ?? mod;
  });

  async function lintFixture(
    text: string,
    file: string,
    ruleIds: string[],
    options: Record<string, unknown> | undefined,
  ): Promise<string[]> {
    const rules: Linter.RulesRecord = {};
    for (const id of ruleIds) {
      const rule = plugin.rules[id];
      rules[`canc/${id}`] = options && acceptsFactoryOptions(rule) ? ['error', options] : 'error';
    }
    const eslint = new ESLint({
      cwd: factoriesDir,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslintParser },
          plugins: { canc: plugin as never },
          rules,
        },
      ],
    });
    const [result] = await eslint.lintText(text, { filePath: path.join(factoriesDir, file) });
    const fatal = result.messages.filter((message) => message.fatal);
    expect(fatal, `${file}: parse or config error`).toEqual([]);
    return result.messages.map((message) => `${(message.ruleId ?? '').replace(/^canc\//, '')}@${message.line}`).sort();
  }

  it('has at least 12 fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(files)('%s: configured run equals markers, plain run equals baseline', async (file) => {
    const text = readFileSync(path.join(factoriesDir, file), 'utf8');
    const header = /^\/\/ options: (.*)$/.exec(text.split('\n')[0]);
    expect(header, `${file}: line 1 must be an options header`).not.toBeNull();
    const options = JSON.parse(header![1]) as Record<string, unknown>;

    const expectedA = lintMarkers(text);
    const expectedB = baselineMarkers(text);
    const ruleIds = new Set([...expectedA, ...expectedB].map((marker) => marker.ruleId));
    for (const [id, rule] of Object.entries(plugin.rules)) {
      if (acceptsFactoryOptions(rule) && !rule.meta.docs?.requiresTypeChecking) {
        ruleIds.add(id);
      }
    }
    const syntactic = [...ruleIds].filter((id) => !plugin.rules[id].meta.docs?.requiresTypeChecking);

    const actualA = await lintFixture(text, file, syntactic, options);
    const actualB = await lintFixture(text, file, syntactic, undefined);
    summary.push(`${file}: A=${actualA.length} B=${actualB.length}`);

    expect(actualA, `${file}: configured run differs from lint markers`).toEqual(pairs(expectedA));
    expect(actualB, `${file}: plain run differs from baseline markers`).toEqual(pairs(expectedB));
  });

  it('prints per-file counts', () => {
    console.log(summary.sort().join('\n'));
    expect(summary.length).toBe(files.length);
  });
});
