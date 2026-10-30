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
  'must-consume-lazy': { recommended: 'error' },
  'no-abort-listener-leak': { strict: 'error' },
  'no-async-executor': { recommended: 'error' },
  'no-async-loop-callback': { recommended: 'warn' },
  'no-cancellation-gap': { strict: 'error' },
  'no-coroutine-dialect-mismatch': { recommended: 'error' },
  'no-executor-return': { recommended: 'error' },
  'no-internal-imports': { recommended: 'error' },
  'no-keyword-alias-import': { recommended: 'warn' },
  'no-unstarred-cancawait': { recommended: 'error' },
  'no-yield-await-in-loop': { strict: 'error' },
  'prefer-canc-combinators': { recommended: 'error' },
  'prefer-cancawait': { recommended: 'warn' },
  'prefer-cancel-aware-wrapper': { strict: 'error' },
  'prefer-canceled-property': { recommended: 'warn' },
  'prefer-is-cancel-error': { recommended: 'error' },
  'prefer-signal-accessor': { recommended: 'warn' },
  'prefer-signal-option': { recommended: 'warn' },
  'prefer-signal-over-controller': { recommended: 'warn', strict: 'error' },
  'require-signal-forwarding': { recommended: 'warn' },
  'valid-canc-params': { recommended: 'error' },
  'valid-cancasync': { recommended: 'error' },
};
