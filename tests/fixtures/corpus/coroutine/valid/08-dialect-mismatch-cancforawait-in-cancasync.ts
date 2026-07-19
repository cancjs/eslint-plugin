// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Correct (block 3, cancForAwait in cancAsync)
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
declare function processCancelable(order: Order): CancelablePromise<void>;

const drain = cancAsync(function* (source: AsyncIterable<Order>) {
 yield* cancForAwait(source, function* (order) {
 yield* cancAwait(processCancelable(order));
 });
});
