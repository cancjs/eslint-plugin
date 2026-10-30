import { cancGenAsync } from '@cancjs/coroutine/gen';

class NotFoundError extends Error {}

export const run = cancGenAsync(function* () {
  throw new NotFoundError('Item not found'); // lint: prefer-canc-throw:preferCancThrow
});
