// Snapshot of examples/_shared/util/src/sleep.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
/**
 * Non-cancelable sleep utility for use in test/mock/scenario glue.
 * For cancelable delays in canc code, use toolbox `delay` instead.
 */
export const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));
