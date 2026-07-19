// Source: flow.md > canc/no-cancelability-erasure > Incorrect (block 4, PromiseLike sink)
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

// A PromiseLike / bare thenable sink is erasure too — cancellation-blind, same as Promise.
declare function enqueue(p: PromiseLike<Job>): void;
enqueue(fetchJobCancelable()); // lint: erased into a PromiseLike sink
