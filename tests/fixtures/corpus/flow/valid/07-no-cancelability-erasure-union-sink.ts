// Source: flow.md > canc/no-cancelability-erasure > Correct (block 7, union sink)
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

interface Job {
  id: string;
}
declare function fetchJobCancelable(): CancelablePromise<Job>;

// Union sinks keep the capability visible; not an erasure.
declare function schedule(p: Promise<Job> | CancelablePromise<Job>): void;
schedule(fetchJobCancelable());

