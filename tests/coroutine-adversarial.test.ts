import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

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

describe('coroutine adversarial false-positive pass', () => {
  let cjsPlugin: BuiltPlugin;
  let eslintStrict: ESLint;
  let eslintRecommended: ESLint;
  let adversarialFiles: string[];

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

    const families = ['coroutine', 'lazy', 'hygiene'];
    adversarialFiles = families
      .flatMap((fam) => {
        const validDir = path.join(corpusDir, fam, 'valid');
        return readdirSync(validDir)
          .filter((name) => /^9\d-adversarial-.*\.ts$/.test(name))
          .sort()
          .map((name) => path.join(validDir, name));
      })
      .sort();

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
  });

  it('lints all 10 adversarial fixtures with zero diagnostics under recommended and strict presets', async () => {
    expect(adversarialFiles).toHaveLength(10);

    const recResults = await eslintRecommended.lintFiles(adversarialFiles);
    const recDiagnostics = recResults.flatMap((r) => r.messages);
    expect(recDiagnostics).toEqual([]);

    const strictResults = await eslintStrict.lintFiles(adversarialFiles);
    const strictDiagnostics = strictResults.flatMap((r) => r.messages);
    expect(strictDiagnostics).toEqual([]);

    console.log('Tested 10 adversarial fixtures, 0 diagnostics');
  });
});
