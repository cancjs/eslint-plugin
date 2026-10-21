import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenDelegate } from '@cancjs/coroutine/gen';
import {
  cancelify,
  promisify,
  promisifyAll,
  LazyPromise,
  createLazyPromise,
  AbortError,
  isAbortError,
  TimeoutError,
  isTimeoutError,
  createCatchError,
  createSuppressError,
  catchAbort,
  suppressAbort,
  catchTimeout,
  suppressTimeout,
} from '@cancjs/toolbox';

declare function attemptFetch(): CancelablePromise<string>;
declare function delay(ms: number): Promise<void>;

export const fetchWithRetry = cancAsync(function* () {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return yield* cancAwait(attemptFetch());
    } catch (err) {
      if (isCancelError(err)) {
        throw err;
      }
      attempts += 1;
      if (attempts >= 3) {
        throw err;
      }
      yield* cancAwait(delay(100));
    }
  }
  throw new Error('Retries exhausted');
});
