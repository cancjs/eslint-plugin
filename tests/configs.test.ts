import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { buildInteropUnicorn } from '../src/configs/interop-unicorn.js';
import plugin from '../src/index.js';
import nativePlugin from '../src/native.js';
import { rules } from '../src/rules/index.js';

type Severity = 'error' | 'warn';

interface Expected {
  recommended?: Severity;
  strict?: Severity;
  stylistic?: Severity;
  native?: true;
}

// Independent literal of the full tier table, never imported from src so drift fails here.
const EXPECTED: Record<string, Expected> = {
  'canc-throw-tail-position': { recommended: 'error', strict: 'error' },
  'exhaustive-catch': { recommended: 'warn', strict: 'error' },
  'executor-cancel-wiring': { strict: 'error' },
  'executor-param-names': { stylistic: 'warn' },
  'handle-cancel-first': { recommended: 'error', strict: 'error' },
  'must-consume-lazy': { recommended: 'error', strict: 'error', native: true },
  'no-abort-listener-leak': { strict: 'error', native: true },
  'no-async-executor': { recommended: 'error', strict: 'error' },
  'no-async-loop-callback': { recommended: 'warn', strict: 'error' },
  'no-cancelability-erasure': { recommended: 'error', strict: 'error' },
  'no-cancellation-gap': { strict: 'error' },
  'no-coroutine-dialect-mismatch': { recommended: 'error', strict: 'error' },
  'no-executor-return': { recommended: 'error', strict: 'error' },
  'no-failure-widening': { recommended: 'warn', strict: 'error' },
  'no-internal-imports': { recommended: 'error', strict: 'error', native: true },
  'no-keyword-alias-import': { recommended: 'warn', strict: 'error' },
  'no-multistep-executor': { recommended: 'warn', strict: 'error' },
  'no-throw-in-chain-callback': { recommended: 'warn', strict: 'error' },
  'no-transform-in-executor': { stylistic: 'warn' },
  'no-unstarred-cancawait': { recommended: 'error', strict: 'error' },
  'no-yield-await-in-loop': { strict: 'error' },
  'prefer-canc-combinators': { recommended: 'error', strict: 'error' },
  'prefer-canc-throw': { recommended: 'warn', strict: 'error' },
  'prefer-cancawait': { recommended: 'warn', strict: 'error' },
  'prefer-cancel-aware-wrapper': { strict: 'error' },
  'prefer-canceled-property': { recommended: 'warn', strict: 'error' },
  'prefer-is-cancel-error': { recommended: 'error', strict: 'error' },
  'prefer-signal-accessor': { recommended: 'warn', strict: 'error' },
  'prefer-signal-option': { recommended: 'warn', strict: 'error' },
  'prefer-signal-over-controller': { recommended: 'warn', strict: 'error' },
  'require-error-discriminant': { recommended: 'warn', strict: 'error' },
  'require-signal-forwarding': { recommended: 'warn', strict: 'error' },
  'valid-canc-params': { recommended: 'error', strict: 'error', native: true },
  'valid-cancasync': { recommended: 'error', strict: 'error' },
};

const PRESETS = ['recommended', 'strict', 'stylistic'] as const;

function ruleMap(configs: Record<string, unknown[]>, preset: string): Record<string, unknown> {
  const entries = configs[preset] as { rules?: Record<string, unknown> }[];
  expect(Array.isArray(entries)).toBe(true);
  expect(entries).toHaveLength(1);
  return entries[0].rules ?? {};
}

describe('preset tier snapshot', () => {
  const mainConfigs = plugin.configs as Record<string, unknown[]>;
  const nativeConfigs = nativePlugin.configs as Record<string, unknown[]>;

  it('lists exactly the registered rules', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(rules).sort());
  });

  for (const preset of PRESETS) {
    const count = Object.values(EXPECTED).filter((row) => row[preset]).length;
    it(`${preset} contains each of its ${count} rules at the expected severity and nothing else`, () => {
      const expected: Record<string, Severity> = {};
      for (const [name, row] of Object.entries(EXPECTED)) {
        const severity = row[preset];
        if (severity) {
          expected[`canc/${name}`] = severity;
        }
      }
      const actual = ruleMap(mainConfigs, preset);
      for (const [id, severity] of Object.entries(expected)) {
        expect(actual[id], id).toBe(severity);
      }
      expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    });
  }

  it('keeps strict-only rules out of recommended', () => {
    const recommended = ruleMap(mainConfigs, 'recommended');
    for (const [name, row] of Object.entries(EXPECTED)) {
      if (row.strict && !row.recommended) {
        expect(recommended, name).not.toHaveProperty(`canc/${name}`);
      }
    }
  });

  it('names each entry and wires the plugin', () => {
    for (const preset of PRESETS) {
      expect(mainConfigs[preset]).toEqual([expect.objectContaining({ name: `canc/${preset}` })]);
      expect(nativeConfigs[preset]).toEqual([expect.objectContaining({ name: `canc/${preset}` })]);
    }
  });

  describe('native entry', () => {
    it('exposes the three presets', () => {
      expect(Object.keys(nativeConfigs)).toEqual(['recommended', 'strict', 'stylistic']);
    });

    it('shares the rules object with the main entry', () => {
      expect(nativePlugin.rules).toBe(plugin.rules);
    });

    for (const preset of PRESETS) {
      it(`${preset} holds only native rules at the main severity`, () => {
        const expected: Record<string, Severity> = {};
        for (const [name, row] of Object.entries(EXPECTED)) {
          const severity = row[preset];
          if (row.native && severity) {
            expected[`canc/${name}`] = severity;
          }
        }
        const actual = ruleMap(nativeConfigs, preset);
        expect(actual).toEqual(expected);
      });
    }
  });
});

describe('interop configs', () => {
  const configs = plugin.configs as Record<
    string,
    { name?: string; files?: string[]; rules?: Record<string, unknown> }[]
  >;

  function mergedRules(name: string): Record<string, unknown> {
    return Object.assign({}, ...configs[name].map((entry) => entry.rules ?? {})) as Record<string, unknown>;
  }

  it('is exposed under the documented names beside the presets', () => {
    expect(Object.keys(configs)).toEqual(
      expect.arrayContaining(['interopTypescriptEslint', 'interopPromise', 'interopUnicorn']),
    );
    expect(Object.keys(nativePlugin.configs ?? {})).toEqual(['recommended', 'strict', 'stylistic']);
  });

  it('typescript-eslint config holds exactly the documented rules', () => {
    expect(configs.interopTypescriptEslint).toHaveLength(1);
    expect(configs.interopTypescriptEslint[0].name).toBe('canc/interop-typescript-eslint');
    expect(mergedRules('interopTypescriptEslint')).toEqual({
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
    });
  });

  it('promise config holds exactly the documented rules, all off', () => {
    expect(configs.interopPromise).toHaveLength(1);
    expect(configs.interopPromise[0].name).toBe('canc/interop-promise');
    expect(mergedRules('interopPromise')).toEqual({
      'promise/prefer-await-to-then': 'off',
      'promise/prefer-catch': 'off',
      'promise/prefer-await-to-callbacks': 'off',
      'promise/catch-or-return': 'off',
      'promise/always-return': 'off',
    });
  });

  it('unicorn config turns off top-level-await only by default', () => {
    expect(configs.interopUnicorn).toHaveLength(1);
    expect(configs.interopUnicorn[0].name).toBe('canc/interop-unicorn');
    expect(mergedRules('interopUnicorn')).toEqual({ 'unicorn/prefer-top-level-await': 'off' });
  });

  it('unicorn builder adds a files-limited no-thenable entry only when asked', () => {
    expect(buildInteropUnicorn({ thenableFiles: [] })).toHaveLength(1);
    const limited = buildInteropUnicorn({ thenableFiles: ['src/lazy/**'] });
    expect(limited).toHaveLength(2);
    expect(limited[1]).toEqual({
      name: 'canc/interop-unicorn-thenable',
      files: ['src/lazy/**'],
      rules: { 'unicorn/no-thenable': 'off' },
    });
  });

  async function lint(overrideConfig: object[]) {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{ files: ['**/*.ts'] }, ...overrideConfig] as never,
    });
    return eslint.lintText('export const value = 1;\n', { filePath: 'sample.ts' });
  }

  it('promise and unicorn configs lint cleanly with no foreign plugin loaded', async () => {
    const results = await lint([...configs.interopPromise, ...configs.interopUnicorn]);
    expect(results[0].messages).toEqual([]);
    const withThenable = await lint([...buildInteropUnicorn({ thenableFiles: ['**/*.ts'] })]);
    expect(withThenable[0].messages).toEqual([]);
  });

  it('typescript-eslint config asks for the plugin to be loaded first', async () => {
    await expect(lint(configs.interopTypescriptEslint)).rejects.toThrow(/Could not find plugin "@typescript-eslint"/);
  });
});
