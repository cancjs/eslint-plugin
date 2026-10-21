// Source: flow.md > canc/prefer-canc-combinators > Correct (allSettled)
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

interface ResourceA {
  a: number;
}
interface ResourceB {
  b: number;
}
interface FetchFailure {
  reason: string;
}
declare function fetchA(): CancelablePromise<ResourceA, FetchFailure>;
declare function fetchB(): CancelablePromise<ResourceB, FetchFailure>;

const results = CancelablePromise.allSettled([fetchA(), fetchB()]);
