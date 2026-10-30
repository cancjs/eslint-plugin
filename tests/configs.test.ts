import { describe, expect, it } from 'vitest';

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
  'no-cancellation-gap': { strict: 'error' },
  'no-coroutine-dialect-mismatch': { recommended: 'error', strict: 'error' },
  'no-executor-return': { recommended: 'error', strict: 'error' },
  'no-failure-widening': { recommended: 'warn', strict: 'error' },
  'no-internal-imports': { recommended: 'error', strict: 'error', native: true },
  'no-keyword-alias-import': { recommended: 'warn', strict: 'error' },
  'no-throw-in-chain-callback': { recommended: 'warn', strict: 'error' },
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
