// Source: coroutine.md > canc/prefer-cancawait > Correct (block 2, cancAwait.all tuple)
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
interface Rate {
  code: string;
}
interface Totals {
  amount: number;
}
declare function fetchOrdersCancelable(): CancelablePromise<Order[]>;
declare function fetchRatesCancelable(): CancelablePromise<Rate[]>;
declare function applyRates(orders: Order[], rates: Rate[]): Totals;

const totals = cancAsync(function* () {
  const [orders, rates] = yield* cancAwait.all([fetchOrdersCancelable(), fetchRatesCancelable()]);
  return applyRates(orders, rates); // tuple types preserved by cancAwait.all
});

