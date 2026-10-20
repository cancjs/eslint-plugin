// Source: coroutine.md > canc/no-async-loop-callback (rec warn) > Incorrect
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

const run = cancAsync(function* (source: AsyncIterable<Order>) {
  yield* cancForAwait(source, async (order) => { // lint: no-async-loop-callback async callback escapes the cancel chain
  await processOrder(order);
  });
});

