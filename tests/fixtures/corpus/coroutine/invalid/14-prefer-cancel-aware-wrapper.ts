// Source: coroutine.md > canc/prefer-cancel-aware-wrapper (strict tier) > Incorrect
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

const run = cancAsync(function* (orderId: string) {
 const { signal, abort } = createAbortSignal(); // lint: hand-rolled cancel propagation
 let completed = false;
 try {
 const res = yield* cancAwait(makeCancelable(rawFetch(orderId, signal)));
 completed = true;
 return res;
 } finally {
 if (!completed) {
 abort();
 }
 }
});
