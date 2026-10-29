import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { readMarkers } from './helpers/corpus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const distCjsPath = path.join(projectRoot, 'dist/index.cjs');
const corpusDir = path.join(projectRoot, 'tests/fixtures/corpus');
const failureDir = path.join(corpusDir, 'failure');

const require = createRequire(import.meta.url);

function getNewestMtimeMs(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const nested = getNewestMtimeMs(full);
      if (nested > newest) {
        newest = nested;
      }
    } else {
      if (stat.mtimeMs > newest) {
        newest = stat.mtimeMs;
      }
    }
  }
  return newest;
}

interface BuiltPlugin {
  meta: {
    name: string;
    version: string;
    namespace: string;
  };
  configs: {
    recommended: Linter.Config[];
    strict: Linter.Config[];
    stylistic?: Linter.Config[];
  };
  rules: Record<string, unknown>;
}

function loadCjs(modulePath: string): BuiltPlugin {
  const mod = require(modulePath) as { default?: BuiltPlugin } & BuiltPlugin;
  return mod.default ?? mod;
}

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) {
    return results;
  }
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const FAILURE_RULES = new Set([
  'prefer-canc-throw',
  'canc-throw-tail-position',
  'exhaustive-catch',
  'require-error-discriminant',
  'no-failure-widening',
  'no-throw-in-chain-callback',
]);

const FAILURE_RULES_PREFIXED = new Set([...FAILURE_RULES].map((id) => `canc/${id}`));

const TYPED_ONLY_FAILURE_RULES = new Set(['exhaustive-catch', 'require-error-discriminant', 'no-failure-widening']);

describe('failure rules phase smoke over built artifacts', () => {
  let cjsPlugin: BuiltPlugin;
  let eslintRecommended: ESLint;
  let invalidFiles: string[];
  let validFiles: string[];

  beforeAll(() => {
    if (!existsSync(distCjsPath)) {
      throw new Error('stale dist: dist/index.cjs missing');
    }
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    if (cjsMtime < newestSrcMtime) {
      throw new Error('stale dist: dist/index.cjs is older than newest file in src');
    }

    cjsPlugin = loadCjs(distCjsPath);

    eslintRecommended = new ESLint({
      cwd: corpusDir,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tseslintParser,
            parserOptions: {
              projectService: true,
              tsconfigRootDir: corpusDir,
            },
          },
        },
        ...cjsPlugin.configs.recommended,
      ],
    });

    invalidFiles = findTsFiles(path.join(failureDir, 'invalid')).sort();
    validFiles = findTsFiles(path.join(failureDir, 'valid')).sort();
  });

  it('fails with stale dist if dist/index.cjs is older than newest src file', () => {
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    expect(cjsMtime).toBeGreaterThanOrEqual(newestSrcMtime);
  });

  it('registers all six failure rules in built plugin rules and recommended preset', () => {
    for (const id of FAILURE_RULES) {
      expect(cjsPlugin.rules, `Expected ${id} to be in built plugin rules`).toHaveProperty(id);
    }

    const recommendedRules = cjsPlugin.configs.recommended.flatMap((c) => Object.keys(c.rules ?? {}));
    for (const id of FAILURE_RULES) {
      const prefixed = `canc/${id}`;
      expect(recommendedRules, `Expected ${prefixed} to be in recommended preset`).toContain(prefixed);
    }

    // canc-throw-tail-position is error, rest are warn
    const recRuleMap = Object.assign({}, ...cjsPlugin.configs.recommended.map((c) => c.rules ?? {}));
    expect(recRuleMap['canc/canc-throw-tail-position']).toBe('error');
    expect(recRuleMap['canc/prefer-canc-throw']).toBe('warn');
    expect(recRuleMap['canc/exhaustive-catch']).toBe('warn');
    expect(recRuleMap['canc/require-error-discriminant']).toBe('warn');
    expect(recRuleMap['canc/no-failure-widening']).toBe('warn');
    expect(recRuleMap['canc/no-throw-in-chain-callback']).toBe('warn');
  });

  it('matches markers on invalid failure fixtures under built recommended preset', async () => {
    expect(invalidFiles.length).toBe(16);

    const results = await eslintRecommended.lintFiles(invalidFiles);
    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && FAILURE_RULES_PREFIXED.has(m.ruleId));
      const markers = readMarkers(r.filePath).filter((m) => FAILURE_RULES.has(m.ruleId));

      const reported = Array.from(
        new Map(
          messages.map((m) => [
            `${m.ruleId?.replace(/^canc\//, '')}:${m.line}`,
            { ruleId: m.ruleId?.replace(/^canc\//, ''), line: m.line },
          ]),
        ).values(),
      );

      const expected = Array.from(
        new Map(markers.map((m) => [`${m.ruleId}:${m.line}`, { ruleId: m.ruleId, line: m.line }])).values(),
      );

      expect(reported, `Diagnostic mismatch for ${rel}`).toEqual(expected);

      for (const m of messages) {
        console.log(`${rel}: ${m.ruleId} at line ${m.line}`);
      }
    }
  }, 30000);

  it('reports zero false positives across failure valid fixtures under built recommended preset', async () => {
    expect(validFiles.length).toBe(16);

    const results = await eslintRecommended.lintFiles(validFiles);
    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && FAILURE_RULES_PREFIXED.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }
  }, 30000);

  it('asserts typed failure rules are silent without parser services', async () => {
    const eslintUntyped = new ESLint({
      cwd: corpusDir,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tseslintParser,
            parserOptions: {
              sourceType: 'module',
              ecmaVersion: 'latest',
            },
          },
        },
        ...cjsPlugin.configs.recommended,
      ],
    });

    const results = await eslintUntyped.lintFiles(invalidFiles);
    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const typedMessages = r.messages.filter(
        (m) => m.ruleId && TYPED_ONLY_FAILURE_RULES.has(m.ruleId.replace(/^canc\//, '')),
      );
      expect(typedMessages, `Expected typed rule to be silent without parser services in ${rel}`).toEqual([]);
    }
  }, 30000);
});
