// Source: hygiene.md > canc/prefer-signal-option > Correct (block 2, array composition)
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
declare const userSignal: AbortSignal;

// Composition: array form, first abort wins, listeners cleaned up on settle.
const quotes = new CancelablePromise<Quote[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchQuotes(controller.signal).then(resolve, reject);
}, { signal: [userSignal, AbortSignal.timeout(5000)] });
