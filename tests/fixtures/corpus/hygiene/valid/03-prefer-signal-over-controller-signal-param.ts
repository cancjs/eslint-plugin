// Source: hygiene.md > canc/prefer-signal-over-controller > Correct (block 1, signal param)
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

interface Report {
  id: string;
}
declare function buildReport(signal: AbortSignal): Promise<Report>;

function loadWithSignal(signal: AbortSignal): CancelablePromise<Report> {
  return new CancelablePromise((resolve, reject) => {
  buildReport(signal).then(resolve, reject);
  }, { signal });
}

