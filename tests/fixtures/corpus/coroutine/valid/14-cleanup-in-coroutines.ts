// Source: coroutine.md > Cleanup in coroutines (documentation pattern, no dedicated rule)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

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
