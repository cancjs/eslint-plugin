// Source: coroutine.md > Cleanup in coroutines (documentation pattern, no dedicated rule)
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

interface Reservation {
  id: string;
}
interface Receipt {
  id: string;
}
declare function reserveStockCancelable(orderId: string): CancelablePromise<Reservation>;
declare function chargeCardCancelable(orderId: string): CancelablePromise<Receipt>;
declare function releaseReservationCancelable(reservationId: string): CancelablePromise<void>;

const checkout = cancAsync(function* (orderId: string) {
  let reservation: Reservation | undefined;
  let done = false;
  try {
  reservation = yield* cancAwait(reserveStockCancelable(orderId));
  const receipt = yield* cancAwait(chargeCardCancelable(orderId));
  done = true;
  return receipt;
  } finally {
  if (!done && reservation) {
  yield* cancAwait(releaseReservationCancelable(reservation.id)); // runs shielded on cancel
  }
  }
});

