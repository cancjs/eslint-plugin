import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.join(__dirname, 'fixtures/corpus');

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

function findValidFixtures(): string[] {
  return findTsFiles(corpusDir).filter((f) => f.replaceAll('\\', '/').includes('/valid/'));
}

// Recommended preset is a flat config array, spreading it keeps this test meaningful
// once phases 01-04 populate `plugin.configs.recommended`: the aggregate then runs whatever
// rules recommended enables, still asserting zero diagnostics on every blessed valid snippet.
const recommendedConfigs: Linter.Config[] =
  Array.isArray(plugin.configs?.recommended) ? plugin.configs.recommended
  : plugin.configs?.recommended ? [plugin.configs.recommended as Linter.Config]
  : [];

function buildEslint(): ESLint {
  return new ESLint({
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
        plugins: { canc: plugin },
      },
      ...recommendedConfigs,
    ],
  });
}

// A handful of corpus fixtures carry `eslint-disable-next-line canc/<rule-id>` comments that
// acknowledge a defect for a rule later phases have not shipped yet (the corpus is written once,
// ahead of the rules it documents); eslint validates disable-comment rule names against
// registered rules unconditionally and reports unresolved ones as a lint message; until the
// referenced rule exists, that message is expected noise, not a false positive from a shipped
// rule; ignore only this exact message shape.
function isForwardReferencedDisableComment(message: string): boolean {
  return (
    /^Definition for rule '[^']+' was not found\.$/.test(message) ||
    message.startsWith('Unused eslint-disable directive')
  );
}

describe('corpus: recommended preset zero-false-positive aggregate (161 valid files, failure: 26)', () => {
  it('corpus/valid contains 161 fixture files (at least 25)', () => {
    expect(findValidFixtures()).toHaveLength(161);
    expect(findValidFixtures().length).toBeGreaterThanOrEqual(25);
  });

  it('produces zero diagnostics for every corpus/valid fixture under the recommended config', async () => {
    const targets = findValidFixtures();
    expect(targets.length).toBeGreaterThan(0);

    const eslint = buildEslint();
    const results = await eslint.lintFiles(targets);
    const withDiagnostics = results
      .map((r) => ({
        ...r,
        messages: r.messages.filter((m) => !isForwardReferencedDisableComment(m.message)),
      }))
      .filter((r) => r.messages.length > 0);

    if (withDiagnostics.length > 0) {
      const detail = withDiagnostics
        .map(
          (r) =>
            `${r.filePath}:\n${r.messages.map((m) => ` ${m.line}:${m.column} ${m.ruleId ?? 'parse-error'} ${m.message}`).join('\n')}`,
        )
        .join('\n');
      throw new Error(`Expected zero diagnostics on blessed corpus, got:\n${detail}`);
    }

    expect(withDiagnostics).toHaveLength(0);
  });
});
