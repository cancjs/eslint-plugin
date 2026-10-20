export type RuleSeverity = 'error' | 'warn';

export interface TierEntry {
  recommended?: RuleSeverity;
  strict?: RuleSeverity;
  stylistic?: RuleSeverity;
}

export const TIERS: Record<string, TierEntry> = {};
