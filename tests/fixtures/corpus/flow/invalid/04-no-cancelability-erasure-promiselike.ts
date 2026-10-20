// Source: flow.md > canc/no-cancelability-erasure > Incorrect (block 4, PromiseLike sink)
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

// A PromiseLike / bare thenable sink is erasure too, cancellation-blind, same as Promise.
declare function enqueue(p: PromiseLike<Job>): void;
enqueue(fetchJobCancelable()); // lint: no-cancelability-erasure erased into a PromiseLike sink

