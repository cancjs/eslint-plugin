import CancelablePromise from '@cancjs/promise';

class SpecificError extends Error {}

declare const p: CancelablePromise<string>;

export const c1 = p.then(() => {
  return CancelablePromise.reject(new SpecificError('bare reject')); // lint: no-throw-in-chain-callback:rejectWithoutFailure
});
