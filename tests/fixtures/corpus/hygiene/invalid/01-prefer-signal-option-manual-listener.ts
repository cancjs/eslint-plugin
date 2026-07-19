// Source: hygiene.md > canc/prefer-signal-option > Incorrect (block 1, manual listener never removed)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Quote {
 id: string;
}
declare function fetchQuotes(signal: AbortSignal): Promise<Quote[]>;

function loadQuotes(signal: AbortSignal): CancelablePromise<Quote[]> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 signal.addEventListener('abort', () => controller.abort()); // lint: listener never removed
 fetchQuotes(controller.signal).then(resolve, reject);
 });
}
