import type { ESLint, Linter } from 'eslint';

import type { RuleSeverity, TierEntry } from './tiers.js';

export interface PluginConfigs {
  [key: string]: Linter.Config[];
  recommended: Linter.Config[];
  strict: Linter.Config[];
  stylistic: Linter.Config[];
}

export function buildConfigs(plugin: unknown, tiers: Record<string, TierEntry>): PluginConfigs {
  const recommendedRules: Record<string, RuleSeverity> = {};
  const strictRules: Record<string, RuleSeverity> = {};
  const stylisticRules: Record<string, RuleSeverity> = {};

  for (const [name, entry] of Object.entries(tiers)) {
    const ruleKey = `canc/${name}`;

    if (entry.recommended) {
      recommendedRules[ruleKey] = entry.recommended;
    }

    const strictSeverity = entry.strict ?? entry.recommended;
    if (strictSeverity) {
      strictRules[ruleKey] = strictSeverity;
    }

    if (entry.stylistic) {
      stylisticRules[ruleKey] = entry.stylistic;
    }
  }

  const typedPlugin = plugin as ESLint.Plugin;

  return {
    recommended: [
      {
        name: 'canc/recommended',
        plugins: { canc: typedPlugin },
        rules: recommendedRules,
      },
    ],
    strict: [
      {
        name: 'canc/strict',
        plugins: { canc: typedPlugin },
        rules: strictRules,
      },
    ],
    stylistic: [
      {
        name: 'canc/stylistic',
        plugins: { canc: typedPlugin },
        rules: stylisticRules,
      },
    ],
  };
}
