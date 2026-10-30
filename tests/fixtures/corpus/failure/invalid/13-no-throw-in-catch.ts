import type CancelablePromise from '@cancjs/promise';

class NotFoundError extends Error {}

declare const p: CancelablePromise<string>;

export const c1 = p.catch(() => { // lint: no-swallowed-cancel
  throw new NotFoundError('Failed'); // lint: no-throw-in-chain-callback:throwInChainCallback
});
