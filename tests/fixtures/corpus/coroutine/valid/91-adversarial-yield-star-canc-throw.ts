import { cancAsync, cancThrow } from '@cancjs/coroutine';

export const failFast = cancAsync(function* (shouldFail: boolean) {
  if (shouldFail) {
    return yield* cancThrow(new Error('Operation aborted early'));
  }
  return 42;
});
