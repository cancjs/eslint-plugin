import { cancAsync, cancAwait, cancThrow } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

class RemoteServiceError extends Error {
  readonly kind = 'RemoteServiceError';
}

declare function callService(): CancelablePromise<string, RemoteServiceError>;

export const loggedService = cancAsync(function* () {
  try {
    return yield* cancAwait(callService());
  } catch (err) {
    console.error('Service call failed:', err);
    return yield* cancThrow(err);
  }
});
