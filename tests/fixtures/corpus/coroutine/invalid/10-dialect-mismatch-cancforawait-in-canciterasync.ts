// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Incorrect (block 3, cancForAwait inside cancIterAsync)
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

const collect = cancIterAsync(function* (source: AsyncIterable<Order>) {
 const all = yield* cancForAwait(source); // lint: cancForAwait inside cancIterAsync
 yield all;
});
