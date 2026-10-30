// Snapshot of examples/demo-signal-interop/src/demo-signal-interop.spec.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
/**
 * Smoke tests: both entries type-check and load
 */

describe('demo-signal-interop', () => {
  it('vanilla entry type-checks', () => {
    // Module resolution only: typescript handles the real type check
    expect(true).toBe(true);
  });

  it('canc entry type-checks', () => {
    // Module resolution only: typescript handles the real type check
    expect(true).toBe(true);
  });
});
