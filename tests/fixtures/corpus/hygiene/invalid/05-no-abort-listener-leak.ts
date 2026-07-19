// Source: hygiene.md > canc/no-abort-listener-leak (CFG rule, lostcancel-style) > Incorrect
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function pollUntil(cb: () => boolean): unknown;

function pollWithSignal(signal: AbortSignal) {
 let stopped = false;
 signal.addEventListener('abort', () => {
 stopped = true; // lint: added per call on a reused signal, never removed
 });
 return pollUntil(() => stopped);
}
