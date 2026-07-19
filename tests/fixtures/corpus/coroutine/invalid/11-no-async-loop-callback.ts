// Source: coroutine.md > canc/no-async-loop-callback (rec warn) > Incorrect
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
declare function processOrder(order: Order): Promise<void>;

const run = cancAsync(function* (source: AsyncIterable<Order>) {
 yield* cancForAwait(source, async (order) => { // lint: async callback escapes the cancel chain
 await processOrder(order);
 });
});
