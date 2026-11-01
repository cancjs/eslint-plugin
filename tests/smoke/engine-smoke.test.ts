import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const srcDir = path.join(projectRoot, 'src');
const distCjsPath = path.join(projectRoot, 'dist/index.cjs');
const distMjsPath = path.join(projectRoot, 'dist/index.mjs');
const pkgPath = path.join(projectRoot, 'package.json');
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
    strict?: Linter.Config[];
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

function isForwardReferencedDisableComment(message: string): boolean {
  return (
    /^Definition for rule '[^']+' was not found\.$/.test(message) ||
    message.startsWith('Unused eslint-disable directive')
  );
}

describe('engine smoke over built artifacts', () => {
  beforeAll(() => {
    if (!existsSync(distCjsPath)) {
      throw new Error('stale dist: dist/index.cjs missing');
    }
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    if (cjsMtime < newestSrcMtime) {
      throw new Error('stale dist: dist/index.cjs is older than newest file in src');
    }
  });

  it('fails with stale dist if dist/index.cjs is older than newest src file', () => {
    const cjsMtime = statSync(distCjsPath).mtimeMs;
    const newestSrcMtime = getNewestMtimeMs(srcDir);
    expect(cjsMtime).toBeGreaterThanOrEqual(newestSrcMtime);
  });

  it('loads dist/index.cjs and dist/index.mjs with expected shape and metadata', async () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

    const cjsPlugin = loadCjs(distCjsPath);
    expect(cjsPlugin.meta.namespace).toBe('canc');
    expect(cjsPlugin.meta.version).toBe(pkg.version);
    expect(Array.isArray(cjsPlugin.configs.recommended)).toBe(true);

    const esmModule = (await import(pathToFileURL(distMjsPath).href)) as { default?: BuiltPlugin } & BuiltPlugin;
    const esmPlugin = esmModule.default ?? esmModule;
    expect(esmPlugin.meta.namespace).toBe('canc');
    expect(esmPlugin.meta.version).toBe(pkg.version);
    expect(Array.isArray(esmPlugin.configs.recommended)).toBe(true);
  });

  it('runs built plugin recommended config over valid corpus fixtures with zero diagnostics', async () => {
    const cjsPlugin = loadCjs(distCjsPath);
    const validFiles = findTsFiles(corpusDir).filter((f) => f.split(path.sep).includes('valid'));
    expect(validFiles.length).toBe(172);

    const eslint = new ESLint({
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

    const results = await eslint.lintFiles(validFiles);
    const withDiagnostics = results
      .map((r) => ({
        ...r,
        messages: r.messages.filter((m) => !isForwardReferencedDisableComment(m.message)),
      }))
      .filter((r) => r.messages.length > 0);

    const diagnosticsCount = withDiagnostics.reduce((sum, r) => sum + r.messages.length, 0);

    console.log(`plugin version: ${cjsPlugin.meta.version}`);
    console.log(`lint results: ${validFiles.length} files, ${diagnosticsCount} diagnostics`);

    if (diagnosticsCount > 0) {
      const detail = withDiagnostics
        .map(
          (r) =>
            `${r.filePath}:\n${r.messages.map((m) => `  ${m.line}:${m.column} ${m.ruleId ?? 'parse-error'} ${m.message}`).join('\n')}`,
        )
        .join('\n');
      throw new Error(`Expected zero diagnostics on valid corpus, got:\n${detail}`);
    }

    expect(diagnosticsCount).toBe(0);
  });
});
