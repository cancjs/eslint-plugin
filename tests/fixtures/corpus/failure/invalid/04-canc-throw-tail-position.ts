import { type AsyncResult, cancAsync, cancThrow } from '@cancjs/coroutine';

class NotFoundError extends Error { readonly kind = 'NotFoundError'; }

export const run = cancAsync(function* (): AsyncResult<string> {
  yield* cancThrow(new NotFoundError('Item not found')); // lint: canc-throw-tail-position:cancThrowTailPosition
});
