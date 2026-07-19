// Source: executor.md > canc/no-async-executor > Correct (block 2, single-operation adapter)
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

// Single-operation adapter for the IIFE variant above.
const cancPromise = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 buildReport(controller.signal).then(resolve, reject);
});
