import type CancelablePromise from '@cancjs/promise';

class SpecificError extends Error {}

declare const p: CancelablePromise<string, SpecificError>;

// canc-allow-widening
export const widened = p as unknown as CancelablePromise<string>;
