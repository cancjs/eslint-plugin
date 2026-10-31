// Snapshot of examples/_shared/util/src/clone.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
/**
 * Deep clone a value using JSON serialization.
 * Suitable for plain data (no functions, circular refs, etc).
 *
 * @param value - Value to clone
 * @returns Cloned value
 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
