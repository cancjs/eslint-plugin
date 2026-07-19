// Source: lazy.md > canc/must-consume-lazy > Incorrect (block 1, dropped immediately)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function connectAnalytics(): Promise<void>;

new LazyPromise((resolve, reject) => {
 connectAnalytics().then(resolve, reject); // lint: never subscribed, never runs
});
