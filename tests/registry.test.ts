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
      expect(Object.keys(TIERS).sort()).toEqual(Object.keys(rules).sort());

      for (const [name, rule] of Object.entries(rules)) {
        const meta = (rule as { meta?: { docs?: { url?: string } } }).meta;
        const url = meta?.docs?.url;
        expect(typeof url).toBe('string');
        expect(url).toMatch(new RegExp(`/${name}\\.md$`));
      }
    });
  });
});
