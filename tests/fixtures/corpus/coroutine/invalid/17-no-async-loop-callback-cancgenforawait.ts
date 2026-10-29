// Source: coroutine.md > canc/no-async-loop-callback > Incorrect (async callback in cancGenForAwait)
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
declare function processOrder(order: Order): Promise<void>;

const stream = cancGenAsync(function* (source: AsyncIterable<Order>) {
  yield* cancGenForAwait(source, async (order) => { // lint: no-async-loop-callback:asyncLoopCallback async callback in cancGenForAwait
    await processOrder(order);
  });
});

void stream;
