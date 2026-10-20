// Source: error-handling.md > canc/prefer-is-cancel-error > Correct (block 3, raw AbortSignal context)
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

// Raw fetch/AbortSignal context (no canc wrapper in between): isAbortError is the right helper.
legacyFetch(url, { signal }).catch((err) => {
  if (isAbortError(err)) {
  return;
  }
  throw err;
});

