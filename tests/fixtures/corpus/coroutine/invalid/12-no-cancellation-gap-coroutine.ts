// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Incorrect (block 1, coroutine gap)
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
declare function pullOrdersCancelable(): CancelablePromise<Order[]>;
declare function legacyPushOrders(): Promise<void>;

const syncOrders = cancAsync(function* () {
  yield* cancAwait(pullOrdersCancelable());
  yield* cancAwait(legacyPushOrders()); // lint: no-cancellation-gap plain promise, work continues after cancel
});

