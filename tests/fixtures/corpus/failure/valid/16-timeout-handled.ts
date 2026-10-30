import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import { isTimeoutError, type TimeoutError } from '@cancjs/toolbox';

declare function withTimeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError>;
declare function fetchItem(): CancelablePromise<string>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(withTimeout(fetchItem(), 5000));
  } catch (e) {
    if (isTimeoutError(e)) {
      // handled
    } else {
      throw e;
    }
  }
});
