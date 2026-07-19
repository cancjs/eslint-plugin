// Source: hygiene.md > canc/prefer-signal-over-controller > Correct (block 1, signal param)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Report {
 id: string;
}
declare function buildReport(signal: AbortSignal): Promise<Report>;

function loadWithSignal(signal: AbortSignal): CancelablePromise<Report> {
 return new CancelablePromise((resolve, reject) => {
 buildReport(signal).then(resolve, reject);
 }, { signal });
}
