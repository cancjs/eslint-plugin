// Snapshot of examples/demo-toolbox/src/gateway-signal-vanilla.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import type { MockApiBundle } from '@shared/mock-api';

type GatewayApi = MockApiBundle['gateway'];

/**
 * Gateway call threaded with AbortSignal. Vanilla: all signal wiring is manual (controller
 * creation, thread-down, error-name check). Cancellation coupling is loose; a caller must
 * manage the signal lifecycle.
 */
export function callGatewayWithSignal(gatewayApi: GatewayApi, signal: AbortSignal): Promise<{ transactionId: string }> {
  return gatewayApi.call({ method: 'pay', amount: 100 }, signal);
}
