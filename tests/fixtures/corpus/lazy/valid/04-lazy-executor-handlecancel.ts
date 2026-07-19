// Source: lazy.md > Executor rules applied to lazy executors > Correct (block 2, handleCancel form)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Feed {
 id: string;
}
declare function openFeed(signal: AbortSignal): Promise<Feed>;

const feed = new LazyPromise<Feed>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 openFeed(controller.signal).then(resolve, reject);
});
