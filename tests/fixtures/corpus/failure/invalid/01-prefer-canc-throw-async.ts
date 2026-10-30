import { cancAsync } from '@cancjs/coroutine';

class NotFoundError extends Error {}

export const run = cancAsync(function* () {
  throw new NotFoundError('Item not found'); // lint: prefer-canc-throw:preferCancThrow
});
