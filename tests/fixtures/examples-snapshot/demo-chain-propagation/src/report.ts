// Snapshot of examples/demo-chain-propagation/src/report.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
// Scenario reporting: unified console output for both vanilla and canc twins.
// Example-specific util, not a copy target.

export function report(step: string): void {
  console.log(`[scenario] ${step}`);
}
