// Source: error-handling.md > canc/prefer-is-cancel-error
// > Incorrect (block 3, AbortError wrong layer)
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

declare function run(): CancelablePromise<void>;

// Awaiting a canc promise constructed with { signal }: the rejection is a CancelError,
// the DOMException is only its cause.
// This check can never match.
try {
  run();
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') { // lint: prefer-is-cancel-error wrong layer
  // no-op
  } else {
  throw err;
  }
}

