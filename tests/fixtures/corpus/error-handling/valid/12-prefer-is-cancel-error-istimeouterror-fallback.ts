// Source: error-handling.md > canc/prefer-is-cancel-error > Correct (isTimeoutError fallback)
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

declare function legacyFetch(url: string, opts: { signal: AbortSignal }): Promise<Response>;
declare const signal: AbortSignal;
declare const url: string;
declare function showStatus(msg: string): void;

// isTimeoutError falls back to error.name, unlike isCancelError; that is deliberate: the
// platform produces these directly (AbortSignal.timeout()), so there is no canc-owned
// constructor to brand; isCancelError never gets this fallback, on purpose
legacyFetch(url, { signal: AbortSignal.timeout(5000) }).catch((err) => {
  if (isTimeoutError(err)) {
    showStatus('Request timed out');
    return;
  }
  throw err;
});
