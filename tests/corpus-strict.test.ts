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

const strictConfigs: Linter.Config[] =
  Array.isArray(plugin.configs?.strict) ? plugin.configs.strict
  : plugin.configs?.strict ? [plugin.configs.strict as Linter.Config]
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
      ...strictConfigs,
    ],
  });
}

const enabledRuleIds = new Set(
  strictConfigs.flatMap((config) =>
    Object.entries(config.rules ?? {})
      .filter(
        ([, setting]) =>
          setting !== 'off' && setting !== 0 && !(Array.isArray(setting) && (setting[0] === 'off' || setting[0] === 0)),
      )
      .map(([id]) => id),
  ),
);

const TYPED_RULES = new Set([
  'canc/exhaustive-catch',
  'canc/no-await-cancelable-in-async',
  'canc/no-cancelability-erasure',
  'canc/no-cancellation-gap',
  'canc/no-failure-widening',
  'canc/prefer-canc-combinators',
  'canc/prefer-canc-throw',
  'canc/prefer-cancel-aware-wrapper',
  'canc/prefer-canceled-property',
  'canc/prefer-signal-accessor',
  'canc/require-error-discriminant',
]);

function namesOnlyIdleRules(ruleIds: string[], typed: boolean): boolean {
  return (
    ruleIds.length > 0 &&
    ruleIds.every((id) => !enabledRuleIds.has(id) || (!typed && TYPED_RULES.has(id)))
  );
}

function isForwardReferencedDisableComment(message: string, typed: boolean): boolean {
  if (/^Definition for rule '[^']+' was not found\.$/.test(message)) {
    return true;
  }
  const unused = /^Unused eslint-disable directive \(no problems were reported from ([^)]+)\)\.$/.exec(message);
  return unused !== null && namesOnlyIdleRules([...unused[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), typed);
}

interface Diagnostic {
  file: string;
  line: number;
  ruleId: string;
}

// New entries need owner approval.
const STRICT_ALLOWLIST = [
  {
    file: 'executor/valid/09-require-signal-forwarding-no-controller.ts',
    ruleId: 'canc/executor-cancel-wiring',
    reason: 'chain-only cancellation without a controller is a recommended-tier idiom; strict asks for wiring',
  },
];

async function collectStrictDiagnostics(typed: boolean): Promise<Diagnostic[]> {
  const targets = findValidFixtures();
  const results = await buildEslint(typed).lintFiles(targets);
  const diagnostics: Diagnostic[] = [];
  for (const r of results) {
    const file = path.relative(corpusDir, r.filePath).replaceAll('\\', '/');
    for (const m of r.messages) {
      if (isForwardReferencedDisableComment(m.message, typed)) continue;
      diagnostics.push({
        file,
        line: m.line,
        ruleId: m.ruleId ?? '',
      });
    }
  }
  return diagnostics;
}

function verifyDiagnosticsAgainstAllowlist(diagnostics: Diagnostic[]): void {
  const hitEntries = new Set<number>();
  const unexpected: Diagnostic[] = [];

  for (const d of diagnostics) {
    const matchIndex = STRICT_ALLOWLIST.findIndex(
      (entry) => entry.file === d.file && entry.ruleId === d.ruleId,
    );
    if (matchIndex === -1) {
      unexpected.push(d);
    } else {
      hitEntries.add(matchIndex);
    }
  }

  expect(unexpected, `Unexpected strict diagnostics: ${JSON.stringify(unexpected, null, 2)}`).toEqual([]);

  for (let i = 0; i < STRICT_ALLOWLIST.length; i++) {
    expect(hitEntries.has(i), `Stale allowlist entry (never hit): ${JSON.stringify(STRICT_ALLOWLIST[i])}`).toBe(true);
  }
}

describe('corpus: strict preset allowlist lane over valid fixtures', () => {
  it('untyped lane matches allowlist', async () => {
    const diagnostics = await collectStrictDiagnostics(false);
    verifyDiagnosticsAgainstAllowlist(diagnostics);
  });

  it('typed lane matches allowlist', async () => {
    const diagnostics = await collectStrictDiagnostics(true);
    verifyDiagnosticsAgainstAllowlist(diagnostics);
  });
});
