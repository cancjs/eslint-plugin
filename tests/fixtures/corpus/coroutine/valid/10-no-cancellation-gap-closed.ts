// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Correct (block 1, gap closed via cancelify)
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
declare function pushOrders(orders: Order[], signal: AbortSignal): Promise<void>;

const pushOrdersCancelable = cancelify(({ signal }, orders: Order[]) =>
  pushOrders(orders, signal),
);

const syncOrders = cancAsync(function* () {
  const orders = yield* cancAwait(pullOrdersCancelable());
  yield* cancAwait(pushOrdersCancelable(orders)); // gap closed: cancel aborts the request
});

