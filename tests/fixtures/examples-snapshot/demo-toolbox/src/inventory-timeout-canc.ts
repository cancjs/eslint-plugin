// Snapshot of examples/demo-toolbox/src/inventory-timeout-canc.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import type { CancelablePromise, Unlisted } from '@cancjs/promise';
import { timeout, TimeoutError } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

type InventoryApi = MockApiBundle['inventory'];

/**
 * Checks inventory quantity with a 500ms timeout using the toolbox timeout utility,
 * which is bound to CancelablePromise. When the timeout fires, it cancels the
 * underlying inventory call immediately. The mock API logs aborted (see spec)
 * compared to vanilla completed.
 */
export function fetchInventoryWithTimeout(
  inventoryApi: InventoryApi,
  productId: string,
): CancelablePromise<number, TimeoutError | Unlisted> {
  return timeout(inventoryApi.check(productId), 500);
}
