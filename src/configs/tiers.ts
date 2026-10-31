export type RuleSeverity = 'error' | 'warn';

export interface TierEntry {
  recommended?: RuleSeverity;
  strict?: RuleSeverity;
  stylistic?: RuleSeverity;
  native?: true;
}

export const TIERS: Record<string, TierEntry> = {
  'canc-throw-tail-position': { recommended: 'error' },
  'exhaustive-catch': { recommended: 'warn' },
  'executor-cancel-wiring': { strict: 'error' },
  'executor-param-names': { stylistic: 'warn' },
  'handle-cancel-first': { recommended: 'error' },
  'must-consume-lazy': { recommended: 'error', native: true },
  'no-abort-listener-leak': { strict: 'error', native: true },
  'no-async-executor': { recommended: 'error' },
  'no-async-loop-callback': { recommended: 'warn' },
  'no-await-cancelable-in-async': { recommended: 'error' },
  'no-cancelability-erasure': { recommended: 'error' },
  'no-cancellation-gap': { strict: 'error' },
  'no-coroutine-dialect-mismatch': { recommended: 'error' },
  'no-executor-return': { recommended: 'error' },
  'no-failure-widening': { recommended: 'warn' },
  'no-internal-imports': { recommended: 'error', native: true },
  'no-keyword-alias-import': { recommended: 'warn' },
  'no-multistep-executor': { recommended: 'warn' },
  'no-swallowed-cancel': { recommended: 'warn' },
  'no-throw-in-chain-callback': { recommended: 'warn' },
  'no-transform-in-executor': { stylistic: 'warn' },
  'no-unstarred-cancawait': { recommended: 'error' },
  'no-yield-await-in-loop': { strict: 'error' },
  'prefer-canc-combinators': { recommended: 'error' },
  'prefer-canc-throw': { recommended: 'warn' },
  'prefer-cancawait': { recommended: 'warn' },
  'prefer-cancel-aware-wrapper': { strict: 'error' },
  'prefer-canceled-property': { recommended: 'warn' },
  'prefer-is-cancel-error': { recommended: 'error' },
  'prefer-signal-accessor': { recommended: 'warn' },
  'prefer-signal-option': { recommended: 'warn' },
  'prefer-signal-over-controller': { recommended: 'warn', strict: 'error' },
  'require-error-discriminant': { recommended: 'warn' },
  'require-loop-advance': { recommended: 'warn' },
  'require-signal-forwarding': { recommended: 'warn' },
  'valid-canc-params': { recommended: 'error', native: true },
  'valid-cancasync': { recommended: 'error' },
};
