// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Correct (block 1, cancGenAwait in cancGenAsync)
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

interface Page {
  items: unknown[];
}
declare function fetchPageCancelable(): CancelablePromise<Page>;

const streamOrders = cancGenAsync(function* () {
  const page = yield* cancGenAwait(fetchPageCancelable()); // internal await, not emitted
  yield page.items; // emitted to the for-await consumer
});

