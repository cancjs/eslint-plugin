import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error {}
interface Unlisted {
  readonly _cancUnlisted: true;
}

declare function getOpen(): CancelablePromise<string, ErrorA | Unlisted>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getOpen());
  } catch (e) { // lint: exhaustive-catch:missingUnlistedFallback
    if (e instanceof ErrorA) {
      console.log('Handled A');
    }
  }
});
