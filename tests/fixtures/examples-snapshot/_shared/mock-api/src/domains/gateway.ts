// Snapshot of examples/_shared/mock-api/src/domains/gateway.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import { AbortSignalLike, MockApi } from '../core';

export interface GatewayApi {
  call(data: any, signal?: AbortSignalLike): Promise<{ transactionId: string }>;
}

export function createGatewayApi(api: MockApi): GatewayApi {
  return {
    call: (data, signal) =>
      api.respond('gateway.call', { data }, () => ({ transactionId: `txn-${Date.now()}` }), signal),
  };
}
