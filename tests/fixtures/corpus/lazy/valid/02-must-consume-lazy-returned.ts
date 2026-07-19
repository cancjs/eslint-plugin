// Source: lazy.md > canc/must-consume-lazy > Correct (block 2, returned to caller)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function prefetchAssets(): Promise<void>;

function warmCache(): LazyPromise<void> {
 return new LazyPromise((resolve, reject) => {
 prefetchAssets().then(resolve, reject);
 }); // returned: the caller decides when to start it
}
