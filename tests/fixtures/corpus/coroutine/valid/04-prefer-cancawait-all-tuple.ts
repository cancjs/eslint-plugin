// Source: coroutine.md > canc/prefer-cancawait > Correct (block 2, cancAwait.all tuple)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

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
