// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Incorrect (block 3, cancForAwait inside cancGenAsync)
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

interface Order {
  id: string;
}

const collect = cancGenAsync(function* (source: AsyncIterable<Order>) {
  const all = yield* cancForAwait(source); // lint: no-coroutine-dialect-mismatch:forAwaitInIter cancForAwait inside cancGenAsync
  yield all;
});

