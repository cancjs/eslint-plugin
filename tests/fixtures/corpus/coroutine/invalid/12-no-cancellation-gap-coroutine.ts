// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Incorrect (block 1, coroutine gap)
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
declare function legacyPushOrders(): Promise<void>;

const syncOrders = cancAsync(function* () {
 yield* cancAwait(pullOrdersCancelable());
 yield* cancAwait(legacyPushOrders()); // lint: plain promise, work continues after cancel
});
