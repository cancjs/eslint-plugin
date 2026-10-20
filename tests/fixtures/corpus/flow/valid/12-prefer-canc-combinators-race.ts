// Source: flow.md > canc/prefer-canc-combinators > Correct (block 2, CancelablePromise.race)
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

interface Resource {
  id: string;
}
declare function fetchPrimary(): CancelablePromise<Resource>;
declare function fetchMirror(): CancelablePromise<Resource>;

const first = CancelablePromise.race([fetchPrimary(), fetchMirror()]);
// The losing request is canceled when the winner settles.

