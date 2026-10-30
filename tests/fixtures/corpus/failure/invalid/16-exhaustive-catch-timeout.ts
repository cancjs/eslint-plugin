import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch (e) { // lint: exhaustive-catch:unhandledFailure,no-swallowed-cancel
    console.error(e);
  }
});
