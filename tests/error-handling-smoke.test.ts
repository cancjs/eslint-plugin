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

const ERROR_HANDLING_RULES = new Set(['prefer-is-cancel-error']);
const ERROR_HANDLING_PREFIXED_RULES = new Set([...ERROR_HANDLING_RULES].map((id) => `canc/${id}`));
// rules that must stay silent on every valid fixture
const SILENT_ON_VALID_RULES = new Set(['canc/prefer-is-cancel-error', 'canc/no-swallowed-cancel']);

describe('error handling rules phase smoke over built artifacts', () => {
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

    invalidFiles = findTsFiles(path.join(corpusDir, 'error-handling/invalid'))
      .filter((filePath) => {
        const markers = readMarkers(filePath);
        return markers.some((m) => ERROR_HANDLING_RULES.has(m.ruleId));
      })
      .sort();
  });

  it('fails with stale dist if dist/index.cjs is older than newest src file', () => {
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    expect(cjsMtime).toBeGreaterThanOrEqual(newestSrcMtime);
  });

  it('matches markers on invalid error-handling fixtures under recommended and strict presets', async () => {
    expect(invalidFiles.length).toBe(8);

    for (const linter of [eslintRecommended, eslintStrict]) {
      const results = await linter.lintFiles(invalidFiles);
      for (const r of results) {
        const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
        const phaseMessages = r.messages.filter((m) => m.ruleId && ERROR_HANDLING_PREFIXED_RULES.has(m.ruleId));
        const markers = readMarkers(r.filePath).filter((m) => ERROR_HANDLING_RULES.has(m.ruleId));

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

  it('reports zero false positives across error-handling valid fixtures', async () => {
    const validFiles = findTsFiles(path.join(corpusDir, 'error-handling/valid')).sort();
    expect(validFiles.length).toBe(22);

    const recResults = await eslintRecommended.lintFiles(validFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && SILENT_ON_VALID_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }

    const strictResults = await eslintStrict.lintFiles(validFiles);
    for (const r of strictResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && SILENT_ON_VALID_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under strict in ${rel}`).toEqual([]);
    }
  }, 20000);

  it('reports zero false positives across all valid corpus fixtures', async () => {
    const allValidFiles = findTsFiles(corpusDir)
      .filter((f) => f.replaceAll('\\', '/').includes('/valid/'))
      .sort();
    expect(allValidFiles.length).toBe(168);

    const recResults = await eslintRecommended.lintFiles(allValidFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && SILENT_ON_VALID_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }
  }, 20000);

  it('reports syntactic invalid fixtures without parser services and stays silent on type-only fixtures', async () => {
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
    const reportedFiles: string[] = [];

    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const phaseMessages = r.messages.filter((m) => m.ruleId && ERROR_HANDLING_PREFIXED_RULES.has(m.ruleId));
      if (phaseMessages.length > 0) {
        reportedFiles.push(rel);
        const markers = readMarkers(r.filePath).filter((m) => ERROR_HANDLING_RULES.has(m.ruleId));
        expect(phaseMessages.map((m) => m.line)).toEqual(markers.map((m) => m.line));
      }
    }

    // Pattern 4 (05-prefer-is-cancel-error-abort-error-wrong-layer.ts)
    // requires type info, so it is silent
    expect(reportedFiles.sort()).toEqual([
      'error-handling/invalid/03-prefer-is-cancel-error-instanceof.ts',
      'error-handling/invalid/04-prefer-is-cancel-error-name-string.ts',
      'error-handling/invalid/06-prefer-is-cancel-error-instance-check.ts',
      'error-handling/invalid/13-prefer-is-cancel-error-renamed-import.ts',
      'error-handling/invalid/14-prefer-is-cancel-error-switch-name.ts',
      'error-handling/invalid/15-prefer-is-cancel-error-negated-instanceof.ts',
      'error-handling/invalid/16-prefer-is-cancel-error-name-aborterror.ts',
    ]);
  }, 20000);
});
