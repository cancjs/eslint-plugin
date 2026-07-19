// Source: flow.md > canc/prefer-canc-combinators > Correct (block 2, CancelablePromise.race)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Resource {
 id: string;
}
declare function fetchPrimary(): CancelablePromise<Resource>;
declare function fetchMirror(): CancelablePromise<Resource>;

const first = CancelablePromise.race([fetchPrimary(), fetchMirror()]);
// The losing request is canceled when the winner settles.
