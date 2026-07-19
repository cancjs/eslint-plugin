// Source: flow.md > canc/no-cancelability-erasure > Correct (block 6, boundary form)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Dashboard {
 id: string;
}
declare function loadDashboard(): CancelablePromise<Dashboard>;

async function run() {
 // Boundary form: the flow is terminally consumed and cancellation is handled.
 const result = await suppressCancel(loadDashboard());
 return result;
}
