// Source: hygiene.md > canc/no-ref-reuse > Incorrect (block 1, same ref passed to two constructions)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare const executorA: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void;
declare const executorB: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void;

const ref = createCancelRef();
const first = new CancelablePromise(executorA, { ref });
const second = new CancelablePromise(executorB, { ref }); // lint: ref already bound (throws)
