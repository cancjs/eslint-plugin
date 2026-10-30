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

const COROUTINE_PHASE_RULES = new Set([
  'valid-cancasync',
  'no-unstarred-cancawait',
  'prefer-cancawait',
  'no-coroutine-dialect-mismatch',
  'no-cancellation-gap',
  'no-yield-await-in-loop',
  'must-consume-lazy',
  'prefer-signal-option',
  'no-abort-listener-leak',
  'no-internal-imports',
  'no-keyword-alias-import',
  'prefer-cancel-aware-wrapper',
  'no-async-loop-callback',
  'prefer-signal-accessor',
  'prefer-canceled-property',
]);

const STRICT_ONLY_RULES = new Set([
  'no-cancellation-gap',
  'no-abort-listener-leak',
  'prefer-cancel-aware-wrapper',
  'no-yield-await-in-loop',
]);

const COROUTINE_PHASE_PREFIXED = new Set([...COROUTINE_PHASE_RULES].map((id) => `canc/${id}`));

describe('coroutine, lazy and hygiene rules phase smoke over built artifacts', () => {
  let cjsPlugin: BuiltPlugin;
  let eslintRecommended: ESLint;
  let eslintWithStrict: ESLint;
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

    const strictOnlyRuleConfig = Object.fromEntries(
      [...STRICT_ONLY_RULES].map((id) => [`canc/${id}`, 'error' as const]),
    );

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

    eslintWithStrict = new ESLint({
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
        {
          rules: strictOnlyRuleConfig,
        },
      ],
    });

    invalidFiles = findTsFiles(corpusDir)
      .filter((filePath) => {
        const norm = filePath.replaceAll('\\', '/');
        if (!norm.includes('/invalid/')) return false;
        if (!norm.includes('/coroutine/') && !norm.includes('/lazy/') && !norm.includes('/hygiene/')) return false;
        const markers = readMarkers(filePath);
        return markers.some((m) => COROUTINE_PHASE_RULES.has(m.ruleId));
      })
      .sort();
  });

  it('fails with stale dist if dist/index.cjs is older than newest src file', () => {
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    expect(cjsMtime).toBeGreaterThanOrEqual(newestSrcMtime);
  });

  it('asserts strict-only rules are absent from recommended and present in strict', () => {
    const recommendedRules = cjsPlugin.configs.recommended.flatMap((c) => Object.keys(c.rules ?? {}));
    const strictRules = cjsPlugin.configs.strict.flatMap((c) => Object.keys(c.rules ?? {}));

    for (const rule of STRICT_ONLY_RULES) {
      const prefixed = `canc/${rule}`;
      expect(recommendedRules, `Expected ${prefixed} to be absent from recommended`).not.toContain(prefixed);
      expect(strictRules, `Expected ${prefixed} to be present in strict`).toContain(prefixed);
    }
  });

  it('matches markers on invalid phase fixtures under recommended + strict-only rules', async () => {
    expect(invalidFiles.length).toBe(35);

    const results = await eslintWithStrict.lintFiles(invalidFiles);
    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const phaseMessages = r.messages.filter((m) => m.ruleId && COROUTINE_PHASE_PREFIXED.has(m.ruleId));
      const markers = readMarkers(r.filePath).filter((m) => COROUTINE_PHASE_RULES.has(m.ruleId));

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
    }
  }, 30000);

  it('reports zero false positives across phase valid fixtures (coroutine, lazy, hygiene)', async () => {
    const phaseValidFiles = findTsFiles(corpusDir)
      .filter((filePath) => {
        const norm = filePath.replaceAll('\\', '/');
        if (!norm.includes('/valid/')) return false;
        return norm.includes('/coroutine/') || norm.includes('/lazy/') || norm.includes('/hygiene/');
      })
      .sort();

    expect(phaseValidFiles.length).toBe(50); // 21 coroutine + 8 lazy + 21 hygiene

    const recResults = await eslintRecommended.lintFiles(phaseValidFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && COROUTINE_PHASE_PREFIXED.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }
  }, 30000);

  it('reports zero false positives across all valid corpus fixtures', async () => {
    const allValidFiles = findTsFiles(corpusDir)
      .filter((f) => f.replaceAll('\\', '/').includes('/valid/'))
      .sort();
    expect(allValidFiles.length).toBe(167);

    const recResults = await eslintRecommended.lintFiles(allValidFiles);
    for (const r of recResults) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const messages = r.messages.filter((m) => m.ruleId && COROUTINE_PHASE_PREFIXED.has(m.ruleId));
      expect(messages, `Unexpected diagnostic under recommended in ${rel}`).toEqual([]);
    }
  }, 30000);

  it('reports syntactic invalid fixtures without parser services and stays silent on type-only fixtures', async () => {
    const strictOnlyRuleConfig = Object.fromEntries(
      [...STRICT_ONLY_RULES].map((id) => [`canc/${id}`, 'error' as const]),
    );

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
        {
          rules: strictOnlyRuleConfig,
        },
      ],
    });

    const results = await eslintUntyped.lintFiles(invalidFiles);
    const reportedFiles: string[] = [];

    for (const r of results) {
      const rel = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
      const phaseMessages = r.messages.filter((m) => m.ruleId && COROUTINE_PHASE_PREFIXED.has(m.ruleId));
      if (phaseMessages.length > 0) {
        reportedFiles.push(rel);
        const markers = readMarkers(r.filePath).filter((m) => COROUTINE_PHASE_RULES.has(m.ruleId));
        const reportedLines = [...new Set(phaseMessages.map((m) => m.line))].sort((a, b) => a - b);
        const expectedLines = [...new Set(markers.map((m) => m.line))].sort((a, b) => a - b);
        expect(reportedLines).toEqual(expectedLines);
      }
    }

    // TYPE-only fixtures remain silent without throwing
    const typeOnlyFiles = [
      'coroutine/invalid/12-no-cancellation-gap-coroutine.ts',
      'coroutine/invalid/13-no-cancellation-gap-chain.ts',
      'hygiene/invalid/11-prefer-canceled-property.ts',
    ];

    for (const f of typeOnlyFiles) {
      expect(reportedFiles).not.toContain(f);
    }

    // 32 syntactic fixtures reported
    expect(reportedFiles).toHaveLength(32);
  }, 30000);
});
