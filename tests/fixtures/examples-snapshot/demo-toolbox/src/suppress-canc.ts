// Snapshot of examples/demo-toolbox/src/suppress-canc.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import { suppressCancel } from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

type InvoicesApi = MockApiBundle['invoices'];

/**
 * Cleanup with suppressCancel. One-liner to suppress cancel-family errors while preserving
 * real errors. Declarative, easier to reason about, and hard to get wrong. The suppress
 * call swallows both CancelError and AbortError.
 */
export function cleanupPaymentRecord(invoicesApi: InvoicesApi, _recordId: string): Promise<void> {
  return suppressCancel(invoicesApi.list().then(() => undefined));
}
