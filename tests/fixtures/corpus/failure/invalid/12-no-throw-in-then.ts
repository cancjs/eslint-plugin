import type CancelablePromise from '@cancjs/promise';

class NotFoundError extends Error {}

declare const p: CancelablePromise<string>;

export const c1 = p.then(() => {
  throw new NotFoundError('Item missing'); // lint: no-throw-in-chain-callback:throwInChainCallback
});
