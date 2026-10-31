import { describe, expect, it } from 'vitest';

import { buildConfigs } from '../src/configs/build.js';
import { type TierEntry, TIERS } from '../src/configs/tiers.js';
import { rules } from '../src/rules/index.js';

describe('rule registry and tier table', () => {
  describe('buildConfigs', () => {
    it('builds exact rule maps for recommended, strict, and stylistic tiers over synthetic table', () => {
      const syntheticTiers: Record<string, TierEntry> = {
        'rule-rec-error': { recommended: 'error' },
        'rule-rec-warn-strict-error': { recommended: 'warn', strict: 'error' },
        'rule-rec-warn': { recommended: 'warn' },
        'rule-stylistic': { stylistic: 'warn' },
      };

      const dummyPlugin = { meta: { name: 'dummy' } };
      const configs = buildConfigs(dummyPlugin, syntheticTiers);

      expect(configs.recommended).toEqual([
        {
          name: 'canc/recommended',
          plugins: { canc: dummyPlugin },
          rules: {
            'canc/rule-rec-error': 'error',
            'canc/rule-rec-warn-strict-error': 'warn',
            'canc/rule-rec-warn': 'warn',
          },
        },
      ]);

      expect(configs.strict).toEqual([
        {
          name: 'canc/strict',
          plugins: { canc: dummyPlugin },
          rules: {
            'canc/rule-rec-error': 'error',
            'canc/rule-rec-warn-strict-error': 'error',
            'canc/rule-rec-warn': 'error',
          },
        },
      ]);

      expect(configs.stylistic).toEqual([
        {
          name: 'canc/stylistic',
          plugins: { canc: dummyPlugin },
          rules: {
            'canc/rule-stylistic': 'warn',
          },
        },
      ]);
    });
  });

  describe('real registry', () => {
    it('TIERS keys match rules keys and every rule meta.docs.url ends with /<name>.md', () => {
      const expectedRuleKeys = [
        'canc-throw-tail-position',
        'executor-cancel-wiring',
        'executor-param-names',
        'exhaustive-catch',
        'handle-cancel-first',
        'must-consume-lazy',
        'no-abort-listener-leak',
        'no-async-executor',
        'no-async-loop-callback',
        'no-await-cancelable-in-async',
        'no-cancelability-erasure',
        'no-cancellation-gap',
        'no-coroutine-dialect-mismatch',
        'no-executor-return',
        'no-failure-widening',
        'no-internal-imports',
        'no-keyword-alias-import',
        'no-multistep-executor',
        'no-swallowed-cancel',
        'no-throw-in-chain-callback',
        'no-transform-in-executor',
        'no-unstarred-cancawait',
        'no-yield-await-in-loop',
        'prefer-canc-combinators',
        'prefer-canc-throw',
        'prefer-cancawait',
        'prefer-cancel-aware-wrapper',
        'prefer-canceled-property',
        'prefer-is-cancel-error',
        'prefer-signal-accessor',
        'prefer-signal-option',
        'prefer-signal-over-controller',
        'require-error-discriminant',
        'require-signal-forwarding',
        'valid-canc-params',
        'valid-cancasync',
      ];

      expect(Object.keys(TIERS).sort()).toEqual(Object.keys(rules).sort());
      expect(Object.keys(rules).sort()).toEqual(expectedRuleKeys);

      for (const [name, rule] of Object.entries(rules)) {
        const meta = (rule as { meta?: { docs?: { url?: string } } }).meta;
        const url = meta?.docs?.url;
        expect(typeof url).toBe('string');
        expect(url).toMatch(new RegExp(`/${name}\\.md$`));
      }
    });
  });
});
