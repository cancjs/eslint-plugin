// Source: hygiene.md > canc/prefer-signal-over-controller > Incorrect (block 2, controller forwarded downstream)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function fetchStage(controller: AbortController): unknown;

function pipeline(controller: AbortController) {
 return fetchStage(controller); // lint: controller forwarded to a downstream callee
}
