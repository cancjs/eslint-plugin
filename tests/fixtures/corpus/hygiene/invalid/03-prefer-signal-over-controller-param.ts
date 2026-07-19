// Source: hygiene.md > canc/prefer-signal-over-controller > Incorrect (block 1, controller param)
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

function loadWithController(controller: AbortController): CancelablePromise<Report> { // lint: takes a controller
 return new CancelablePromise((resolve, reject, handleCancel) => {
 handleCancel(() => controller.abort());
 buildReport(controller.signal).then(resolve, reject);
 });
}
