// Source: executor.md > canc/no-async-executor > Incorrect (block 2, evasion variant)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function buildReport(signal: AbortSignal): Promise<Report>;
interface Report {
 id: string;
}

// Evasion variant: an async IIFE inside the executor is the same defect, even for a single
// operation. The synchronous adapter below is the fix.
const cancPromise = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 (async () => { // lint: async wrapper inside executor
 resolve(await buildReport(controller.signal));
 })().catch(reject);
});
