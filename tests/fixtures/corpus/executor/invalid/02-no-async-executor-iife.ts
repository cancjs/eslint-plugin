// Source: executor.md > canc/no-async-executor > Incorrect (block 2, evasion variant)
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

declare function buildReport(signal: AbortSignal): Promise<Report>;
interface Report {
  id: string;
}

// Evasion variant: an async IIFE inside the executor is the same defect;
// the synchronous adapter below is the fix.
const cancPromise = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  (async () => { // lint: no-async-executor async wrapper inside executor
  resolve(await buildReport(controller.signal));
  })().catch(reject);
});

