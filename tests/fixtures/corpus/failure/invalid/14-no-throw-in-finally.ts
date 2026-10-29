import type CancelablePromise from '@cancjs/promise';

class CleanupError extends Error {}

declare const p: CancelablePromise<string>;

export const c1 = p.finally(() => {
  throw new CleanupError('Cleanup failed'); // lint: no-throw-in-chain-callback:throwInChainCallback
});
