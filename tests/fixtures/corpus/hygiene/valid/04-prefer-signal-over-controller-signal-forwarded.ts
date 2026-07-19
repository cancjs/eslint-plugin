// Source: hygiene.md > canc/prefer-signal-over-controller > Correct (block 2, only signal travels downstream)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function fetchStage(signal: AbortSignal): unknown;

function pipeline(signal: AbortSignal) {
 return fetchStage(signal); // only the signal travels downstream
}
