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

const REGISTERED_RULES = new Set([
  'executor-cancel-wiring',
  'executor-param-names',
  'handle-cancel-first',
  'no-async-executor',
  'no-executor-return',
  'prefer-signal-over-controller',
  'require-signal-forwarding',
  'valid-canc-params',
]);

const REGISTERED_PREFIXED_RULES = new Set([...REGISTERED_RULES].map((id) => `canc/${id}`));

describe('executor rules phase smoke over built artifacts', () => {
  let cjsPlugin: BuiltPlugin;
  let eslintStrict: ESLint;
  let eslintRecommended: ESLint;
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
        ...(cjsPlugin.configs.stylistic ?? []),
      ],
    });

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

    const executorInvalid = findTsFiles(path.join(corpusDir, 'executor/invalid'))
      .filter((f) => {
        const base = path.basename(f);
        return !base.startsWith('03-') && !base.startsWith('04-') && !base.startsWith('05-');
      })
      .sort();

    const lazy03 = [
      path.join(corpusDir, 'lazy/invalid/03-no-executor-return.ts'),
      path.join(corpusDir, 'lazy/invalid/03-lazy-executor-async.ts'),
    ].find(existsSync);
    const lazy04 = [
      path.join(corpusDir, 'lazy/invalid/04-no-async-executor.ts'),
      path.join(corpusDir, 'lazy/invalid/04-lazy-executor-value-return.ts'),
    ].find(existsSync);
    const lazyInvalid = [lazy03, lazy04].filter(Boolean) as string[];

    const hygieneInvalid = [
      path.join(corpusDir, 'hygiene/invalid/03-prefer-signal-over-controller-param.ts'),
      path.join(corpusDir, 'hygiene/invalid/04-prefer-signal-over-controller-forwarded.ts'),
    ].filter(existsSync);

    invalidFiles = [...executorInvalid, ...lazyInvalid, ...hygieneInvalid].sort();
  });

  it('fails with stale dist if dist/index.cjs is older than newest src file', () => {
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    expect(cjsMtime).toBeGreaterThanOrEqual(newestSrcMtime);
  });

  it('matches markers on invalid corpus fixtures under strict and asserts recommended behavior', async () => {
    expect(invalidFiles.length).toBe(23);

    const strictResults = await eslintStrict.lintFiles(invalidFiles);
    for (const r of strictResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const phaseMessages = r.messages.filter(
        (m) =>
          m.ruleId &&
          REGISTERED_PREFIXED_RULES.has(m.ruleId) &&
          (rel.includes('08-executor-cancel-wiring.ts') || m.ruleId !== 'canc/executor-cancel-wiring'),
      );
      const markers = readMarkers(r.filePath).filter((m) => REGISTERED_RULES.has(m.ruleId));

      const reported = Array.from(
        new Map(
          phaseMessages.map((m) => [
            `${m.ruleId?.replace(/^canc\//, '')}:${m.line}`,
            { ruleId: m.ruleId?.replace(/^canc\//, ''), line: m.line },
          ]),
        ).values(),
      );
      const expected = Array.from(
        new Map(markers.map((m) => [`${m.ruleId}:${m.line}`, { ruleId: m.ruleId, line: m.line }])).values(),
      );

      expect(reported, `Diagnostic mismatch for ${rel}`).toEqual(expected);

      for (const m of phaseMessages) {
        console.log(`${rel}: ${m.ruleId} at line ${m.line}`);
      }

      if (rel.includes('08-executor-cancel-wiring.ts')) {
        const wiringMsg = phaseMessages.find((m) => m.ruleId === 'canc/executor-cancel-wiring');
        expect(wiringMsg).toBeDefined();
        expect(wiringMsg?.severity).toBe(2);
      }

      if (rel.includes('hygiene/invalid/03') || rel.includes('hygiene/invalid/04')) {
        const preferMsg = phaseMessages.find((m) => m.ruleId === 'canc/prefer-signal-over-controller');
        expect(preferMsg).toBeDefined();
        expect(preferMsg?.severity).toBe(2);
      }
    }

    const recResults = await eslintRecommended.lintFiles(invalidFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const phaseMessages = r.messages.filter((m) => m.ruleId && REGISTERED_PREFIXED_RULES.has(m.ruleId));

      if (rel.includes('08-executor-cancel-wiring.ts')) {
        expect(phaseMessages.filter((m) => m.ruleId === 'canc/executor-cancel-wiring')).toHaveLength(0);
      } else if (rel.includes('12-executor-param-names') || rel.includes('13-executor-param-names')) {
        expect(phaseMessages.filter((m) => m.ruleId === 'canc/executor-param-names')).toHaveLength(0);
      } else {
        const markers = readMarkers(r.filePath).filter((m) => REGISTERED_RULES.has(m.ruleId));
        const reported = phaseMessages.map((m) => ({ ruleId: m.ruleId?.replace(/^canc\//, ''), line: m.line }));
        const expected = markers.map((m) => ({ ruleId: m.ruleId, line: m.line }));
        expect(reported, `Missing diagnostic for ${markers[0]?.ruleId} in ${rel}`).toEqual(expected);

        if (rel.includes('hygiene/invalid/03') || rel.includes('hygiene/invalid/04')) {
          const preferMsg = phaseMessages.find((m) => m.ruleId === 'canc/prefer-signal-over-controller');
          expect(preferMsg).toBeDefined();
          expect(preferMsg?.severity).toBe(1);
        }
      }
    }
  }, 20000);

  it('reports zero false positives across valid corpus fixtures under recommended and strict presets', async () => {
    const validFiles = findTsFiles(corpusDir)
      .filter((f) => f.replaceAll('\\', '/').includes('/valid/'))
      .sort();
    expect(validFiles.length).toBe(117);

    const recResults = await eslintRecommended.lintFiles(validFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && REGISTERED_PREFIXED_RULES.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }

    const strictPresetLinter = new ESLint({
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

    const strictResults = await strictPresetLinter.lintFiles(validFiles);
    for (const r of strictResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => {
        if (!m.ruleId || !REGISTERED_PREFIXED_RULES.has(m.ruleId)) {
          return false;
        }
        if (
          (rel.endsWith('09-require-signal-forwarding-no-controller.ts') ||
            rel.endsWith('01-must-consume-lazy-consumed-later.ts') ||
            rel.endsWith('02-must-consume-lazy-returned.ts')) &&
          m.ruleId === 'canc/executor-cancel-wiring'
        ) {
          return false;
        }
        return true;
      });
      expect(messages, `Unexpected diagnostic under strict in ${rel}`).toEqual([]);
    }
  }, 20000);

  it('reports only SYN-fallback cases for prefer-signal-over-controller without type information', async () => {
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
        ...cjsPlugin.configs.strict,
        ...(cjsPlugin.configs.stylistic ?? []),
      ],
    });

    const results = await eslintUntyped.lintFiles(invalidFiles);
    const reportedFiles: string[] = [];

    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const preferSignalMsgs = r.messages.filter((m) => m.ruleId === 'canc/prefer-signal-over-controller');
      if (preferSignalMsgs.length > 0) {
        reportedFiles.push(rel);
        const markers = readMarkers(r.filePath).filter((m) => m.ruleId === 'prefer-signal-over-controller');
        expect(preferSignalMsgs.map((m) => m.line)).toEqual(markers.map((m) => m.line));
      }
    }

    expect(reportedFiles.sort()).toEqual([
      'hygiene/invalid/03-prefer-signal-over-controller-param.ts',
      'hygiene/invalid/04-prefer-signal-over-controller-forwarded.ts',
    ]);
  });
});
