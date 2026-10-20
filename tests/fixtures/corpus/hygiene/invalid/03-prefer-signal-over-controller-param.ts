// Source: hygiene.md > canc/prefer-signal-over-controller > Incorrect (block 1, controller param)
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

function loadWithController(controller: AbortController): CancelablePromise<Report> { // lint: prefer-signal-over-controller takes a controller
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
  handleCancel(() => controller.abort());
  buildReport(controller.signal).then(resolve, reject);
  });
}

