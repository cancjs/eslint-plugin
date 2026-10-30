// Snapshot of examples/_shared/mock-api/src/domains/prices.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import { AbortSignalLike, MockApi } from '../core';

export interface PricePoint {
  symbol: string;
  price: number;
  at: number;
}

export interface PricesApi {
  quote(symbol: string, signal?: AbortSignalLike): Promise<PricePoint>;
}

export function createPricesApi(api: MockApi): PricesApi {
  return {
    quote: (symbol, signal) =>
      api.respond(
        'prices.quote',
        { symbol },
        () => ({ symbol, price: Number((10 + api.random() * 490).toFixed(2)), at: Date.now() }),
        signal,
      ),
  };
}
