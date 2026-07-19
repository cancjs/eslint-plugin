// Source: coroutine.md > canc/no-async-loop-callback (rec warn) > Correct
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
declare function processOrderCancelable(order: Order): CancelablePromise<void>;

const run = cancAsync(function* (source: AsyncIterable<Order>) {
 yield* cancForAwait(source, function* (order) {
 yield* cancAwait(processOrderCancelable(order)); // cancelable per-item step
 });
});
