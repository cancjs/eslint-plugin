// Source: lazy.md > Executor rules applied to lazy executors > Correct (block 1, teardown return)
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
interface FeedSocket {
 onData(cb: (data: Feed) => void): void;
 onError(cb: (err: unknown) => void): void;
 close(): void;
}
declare function openFeedSocket(): FeedSocket;

const feed = new LazyPromise<Feed>((resolve, reject) => {
 const socket = openFeedSocket();
 socket.onData(resolve);
 socket.onError(reject);
 return () => socket.close(); // teardown function return: sanctioned lazy contract
});
