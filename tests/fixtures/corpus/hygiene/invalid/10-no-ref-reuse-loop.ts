// Source: hygiene.md > canc/no-ref-reuse > Incorrect (block 2, ref reused across loop iterations)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare const ids: string[];
declare function makeExecutor(
 id: string,
): (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void;
declare const queue: CancelablePromise<unknown>[];

const ref = createCancelRef();
for (const id of ids) {
 queue.push(new CancelablePromise(makeExecutor(id), { ref })); // lint: reused across iterations
}
