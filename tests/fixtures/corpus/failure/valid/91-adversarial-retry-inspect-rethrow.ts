import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

class TransientError extends Error {
  readonly kind = 'TransientError';
}
class PermanentError extends Error {
  readonly kind = 'PermanentError';
}

declare function fetchBatch(): CancelablePromise<string[], TransientError | PermanentError>;

export const retryBatch = cancAsync(function* () {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return yield* cancAwait(fetchBatch());
    } catch (err) {
      if (err instanceof TransientError) {
        attempts += 1;
      } else {
        throw err;
      }
    }
  }
  return [];
});
