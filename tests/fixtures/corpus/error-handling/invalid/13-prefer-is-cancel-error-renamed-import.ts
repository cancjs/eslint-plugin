// Source: error-handling.md > canc/prefer-is-cancel-error > Incorrect (renamed import instanceof)
import CancelablePromise, {
  CancelError as CE,
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

declare function run(): void;

try {
  run();
} catch (err) {
  if (err instanceof CE) { // lint: prefer-is-cancel-error:instanceofCancelError
    // no-op
  } else {
    throw err;
  }
}
