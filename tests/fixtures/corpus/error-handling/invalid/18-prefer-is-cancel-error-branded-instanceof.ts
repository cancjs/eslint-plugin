// Source: error-handling.md > canc/prefer-is-cancel-error > Incorrect (block 9)
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
  SupersededError,
  isSupersededError,
  createCatchError,
  createSuppressError,
  catchAbort,
  suppressAbort,
  catchTimeout,
  suppressTimeout,
} from '@cancjs/toolbox';

declare function run(): void;

try {
  run();
} catch (err) {
  if (err instanceof TimeoutError) { // lint: prefer-is-cancel-error:instanceofBrandedError
    return;
  }
  if (err instanceof SupersededError) { // lint: prefer-is-cancel-error:instanceofBrandedError
    return;
  }
  throw err;
}
