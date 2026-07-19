// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Correct (block 1, cancIterAwait in cancIterAsync)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Page {
 items: unknown[];
}
declare function fetchPageCancelable(): CancelablePromise<Page>;

const streamOrders = cancIterAsync(function* () {
 const page = yield* cancIterAwait(fetchPageCancelable()); // internal await, not emitted
 yield page.items; // emitted to the for-await consumer
});
