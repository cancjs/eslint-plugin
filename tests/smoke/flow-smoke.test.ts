import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { readMarkers } from '../helpers/corpus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const srcDir = path.join(projectRoot, 'src');
const distCjsPath = path.join(projectRoot, 'dist/index.cjs');
const corpusDir = path.join(projectRoot, 'tests/fixtures/corpus');

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

const FLOW_RULES = new Set(['prefer-canc-combinators']);
const FLOW_PREFIXED_RULES = new Set([...FLOW_RULES].map((id) => `canc/${id}`));

describe('flow rules phase smoke over built artifacts', () => {
  let cjsPlugin: BuiltPlugin;
  let eslintRecommended: ESLint;
  let eslintStrict: ESLint;
  let invalidFiles: string[];

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

    eslintStrict = new ESLint({
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
        ...cjsPlugin.configs.strict,
      ],
    });

    invalidFiles = findTsFiles(path.join(corpusDir, 'flow/invalid'))
      .filter((filePath) => {
        const markers = readMarkers(filePath);
        return markers.some((m) => FLOW_RULES.has(m.ruleId));
      })
      .sort();
  });

  it('fails with stale dist if dist/index.cjs is older than newest src file', () => {
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    expect(cjsMtime).toBeGreaterThanOrEqual(newestSrcMtime);
  });

  it('matches markers on invalid flow fixtures under recommended and strict presets', async () => {
    expect(invalidFiles.length).toBe(3);

    for (const linter of [eslintRecommended, eslintStrict]) {
      const results = await linter.lintFiles(invalidFiles);
      for (const r of results) {
        const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
        const phaseMessages = r.messages.filter((m) => m.ruleId && FLOW_PREFIXED_RULES.has(m.ruleId));
        const markers = readMarkers(r.filePath).filter((m) => FLOW_RULES.has(m.ruleId));

        const reported = phaseMessages.map((m) => ({
          ruleId: m.ruleId?.replace(/^canc\//, ''),
          line: m.line,
        }));
        const expected = markers.map((m) => ({
          ruleId: m.ruleId,
          line: m.line,
        }));

        expect(reported, `Diagnostic mismatch for ${rel}`).toEqual(expected);

        for (const m of phaseMessages) {
          console.log(`${rel}: ${m.ruleId} at line ${m.line}`);
          expect(m.severity).toBe(2);
        }
      }
    }
  }, 20000);

  it('reports zero false positives across flow valid fixtures', async () => {
    const flowValidFiles = findTsFiles(path.join(corpusDir, 'flow/valid')).sort();
    expect(flowValidFiles.length).toBe(30);

    const recResults = await eslintRecommended.lintFiles(flowValidFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && FLOW_PREFIXED_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }

    const strictResults = await eslintStrict.lintFiles(flowValidFiles);
    for (const r of strictResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && FLOW_PREFIXED_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under strict in ${rel}`).toEqual([]);
    }
  }, 20000);

  it('reports zero false positives across all valid corpus fixtures', async () => {
    const allValidFiles = findTsFiles(corpusDir)
      .filter((f) => f.replaceAll('\\', '/').includes('/valid/'))
      .sort();
    expect(allValidFiles.length).toBe(107);

    const recResults = await eslintRecommended.lintFiles(allValidFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && FLOW_PREFIXED_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }
  }, 20000);

  it('reports nothing without parser services on flow invalid fixtures', async () => {
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
      const messages = r.messages.filter((m) => m.ruleId && FLOW_PREFIXED_RULES.has(m.ruleId));
      expect(messages, `Expected silence without type info in ${rel}`).toEqual([]);
    }
  });
});
