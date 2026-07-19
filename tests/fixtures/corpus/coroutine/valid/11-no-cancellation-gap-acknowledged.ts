// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Correct (block 2, acknowledged gap)
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

// Acknowledged gap: legacy API has no abort support; chain-level cancellation is the ceiling.
const syncOrders = cancAsync(function* () {
 yield* cancAwait(pullOrdersCancelable());
 // eslint-disable-next-line canc/no-cancellation-gap
 yield* cancAwait(legacyPushOrders());
});
