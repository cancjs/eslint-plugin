// Source: hygiene.md > canc/prefer-signal-option > Incorrect (block 2, manual pre-abort check)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare class CancelError extends Error {}
interface Quote {
 id: string;
}
declare function fetchQuotes(): Promise<Quote[]>;

function loadQuotes(signal: AbortSignal): CancelablePromise<Quote[]> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 if (signal.aborted) { // lint: pre-abort handled by the signal option
 reject(new CancelError());
 return;
 }
 fetchQuotes().then(resolve, reject);
 });
}
