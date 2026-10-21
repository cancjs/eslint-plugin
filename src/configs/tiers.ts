export type RuleSeverity = 'error' | 'warn';

export interface TierEntry {
  recommended?: RuleSeverity;
  strict?: RuleSeverity;
  stylistic?: RuleSeverity;
}

export const TIERS: Record<string, TierEntry> = {
  'executor-cancel-wiring': { strict: 'error' },
  'executor-param-names': { stylistic: 'warn' },
  'handle-cancel-first': { recommended: 'error' },
  'no-async-executor': { recommended: 'error' },
  'no-executor-return': { recommended: 'error' },
  'prefer-signal-over-controller': { recommended: 'warn', strict: 'error' },
  'require-signal-forwarding': { recommended: 'warn' },
  'valid-canc-params': { recommended: 'error' },
};
