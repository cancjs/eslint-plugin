// Source: lazy.md > canc/must-consume-lazy > Incorrect (block 2, local unused before return)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function prefetchAssets(): Promise<void>;

function warmCache() {
 const warmup = new LazyPromise<void>((resolve, reject) => {
 prefetchAssets().then(resolve, reject);
 });
 // lint: local lazy promise never consumed; function returns without starting it
}
