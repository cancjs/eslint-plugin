// Source: hygiene.md > canc/no-abort-listener-leak (CFG rule, lostcancel-style) > Correct
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function pollUntil(cb: () => boolean): Promise<void> & { finally(cb: () => void): unknown };

function pollWithSignal(signal: AbortSignal) {
 let stopped = false;
 const onAbort = () => {
 stopped = true;
 };
 signal.addEventListener('abort', onAbort, { once: true });
 return pollUntil(() => stopped).finally(() => signal.removeEventListener('abort', onAbort));
}
