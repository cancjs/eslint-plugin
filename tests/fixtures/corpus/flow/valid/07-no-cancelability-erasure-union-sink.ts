// Source: flow.md > canc/no-cancelability-erasure > Correct (block 7, union sink)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Job {
 id: string;
}
declare function fetchJobCancelable(): CancelablePromise<Job>;

// Union sinks keep the capability visible; not an erasure.
declare function schedule(p: Promise<Job> | CancelablePromise<Job>): void;
schedule(fetchJobCancelable());
