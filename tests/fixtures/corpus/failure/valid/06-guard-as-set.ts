import type { CancelablePromise, MatchedError } from '@cancjs/promise';
import { catchErrors, createIsError, withFailure } from '@cancjs/promise';

class HttpError extends Error {}
class NotFoundError extends Error {}

const isUserFailure = createIsError(HttpError, NotFoundError);

export function handleUserFailure(p: CancelablePromise<string>) {
  const guarded = withFailure(isUserFailure)(p);
  catchErrors(guarded, isUserFailure);

  try {
    // try block
  } catch (e) {
    if (isUserFailure(e)) {
      const _matched: MatchedError<typeof isUserFailure> = e;
      void _matched;
    } else {
      throw e;
    }
  }
}
