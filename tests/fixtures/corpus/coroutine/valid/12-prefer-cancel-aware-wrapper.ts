// Source: coroutine.md > canc/prefer-cancel-aware-wrapper (strict tier) > Correct
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Result {
 id: string;
}
declare function rawFetch(orderId: string, signal: AbortSignal): Promise<Result>;

const fetchOrder = cancelify((getSignal: () => AbortSignal, orderId: string) => rawFetch(orderId, getSignal()));

const run = cancAsync(function* (orderId: string) {
 return yield* cancAwait(fetchOrder(orderId)); // cancel the coroutine, the wrapped op aborts
});
