// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Correct (block 1, gap closed via cancelify)
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
declare function pullOrdersCancelable(): CancelablePromise<Order[]>;
declare function pushOrders(orders: Order[], signal: AbortSignal): Promise<void>;

const pushOrdersCancelable = cancelify((getSignal: () => AbortSignal, orders: Order[]) =>
 pushOrders(orders, getSignal()),
);

const syncOrders = cancAsync(function* () {
 const orders = yield* cancAwait(pullOrdersCancelable());
 yield* cancAwait(pushOrdersCancelable(orders)); // gap closed: cancel aborts the request
});
