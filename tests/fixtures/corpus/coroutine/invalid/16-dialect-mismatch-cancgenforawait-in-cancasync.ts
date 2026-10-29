// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Incorrect (cancGenForAwait)
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

declare function processOrderCancelable(order: Order): CancelablePromise<void>;

const run = cancAsync(function* (source: AsyncIterable<Order>) {
  yield* cancGenForAwait(source, function* (order) { // lint: no-coroutine-dialect-mismatch:iterForAwaitInCancAsync cancGenForAwait inside cancAsync
    yield* cancAwait(processOrderCancelable(order));
  });
});

void run;
