// Source: lazy.md > Executor rules applied to lazy executors > Incorrect (block 1, async lazy executor)
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
declare function openFeed(): Promise<Feed>;

const feed = new LazyPromise<Feed>(async (resolve, reject) => { // lint: async lazy executor
 resolve(await openFeed());
});
