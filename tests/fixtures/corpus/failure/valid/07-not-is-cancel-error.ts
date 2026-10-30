import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import { isCancelError } from '@cancjs/promise';

declare function fetchResource(): CancelablePromise<string>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(fetchResource());
  } catch (e) {
    if (!isCancelError(e)) {
      throw e;
    }
  }
});
