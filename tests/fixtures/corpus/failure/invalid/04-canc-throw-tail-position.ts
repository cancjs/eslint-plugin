import { cancAsync, cancThrow } from '@cancjs/coroutine';

class NotFoundError extends Error {}

export const run = cancAsync(function* () {
  yield* cancThrow(new NotFoundError('Item not found')); // lint: canc-throw-tail-position:cancThrowTailPosition
});
