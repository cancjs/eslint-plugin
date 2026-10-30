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

function buildEslint(typed = false): ESLint {
  return new ESLint({
    cwd: corpusDir,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslintParser,
          parserOptions:
            typed ?
              { projectService: true, tsconfigRootDir: corpusDir }
            : { sourceType: 'module', ecmaVersion: 'latest' },
        },
        plugins: { canc: plugin },
      },
      ...recommendedConfigs,
    ],
  });
}

const enabledRuleIds = new Set(
  recommendedConfigs.flatMap((config) =>
    Object.entries(config.rules ?? {})
      .filter(
        ([, setting]) =>
          setting !== 'off' && setting !== 0 && !(Array.isArray(setting) && (setting[0] === 'off' || setting[0] === 0)),
      )
      .map(([id]) => id),
  ),
);

function namesOnlyIdleRules(ruleIds: string[]): boolean {
  return ruleIds.length > 0 && ruleIds.every((id) => !enabledRuleIds.has(id));
}

// directives for rules this run never executes (unshipped or outside the preset) are expected noise
// a directive naming a rule the preset does run is a real finding
function isForwardReferencedDisableComment(message: string): boolean {
  if (/^Definition for rule '[^']+' was not found\.$/.test(message)) {
    return true;
  }
  const unused = /^Unused eslint-disable directive \(no problems were reported from ([^)]+)\)\.$/.exec(message);
  return unused !== null && namesOnlyIdleRules([...unused[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

async function lintValidFixtures(typed: boolean): Promise<string> {
  const targets = findValidFixtures();
  expect(targets.length).toBeGreaterThan(0);

  const results = await buildEslint(typed).lintFiles(targets);
  return results
    .map((r) => ({
      ...r,
      messages: r.messages.filter((m) => !isForwardReferencedDisableComment(m.message)),
    }))
    .filter((r) => r.messages.length > 0)
    .map((r) => {
      const lines = r.messages.map((m) => ` ${m.line}:${m.column} ${m.ruleId ?? 'parse-error'} ${m.message}`);
      return [`${r.filePath}:`, ...lines].join('\n');
    })
    .join('\n');
}

describe('corpus: recommended preset zero-false-positive aggregate (166 valid files, failure: 26)', () => {
  it('corpus/valid contains 166 fixture files (at least 25)', () => {
    expect(findValidFixtures()).toHaveLength(166);
    expect(findValidFixtures().length).toBeGreaterThanOrEqual(25);
  });

  it('produces zero diagnostics for every corpus/valid fixture under the recommended config', async () => {
    const detail = await lintValidFixtures(false);
    expect(detail, 'expected zero diagnostics on blessed corpus').toBe('');
  });

  it('produces zero diagnostics for every corpus/valid fixture with type information', async () => {
    const detail = await lintValidFixtures(true);
    expect(detail, 'expected zero typed diagnostics on blessed corpus').toBe('');
  });
});
