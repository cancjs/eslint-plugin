// Source: lazy.md > canc/must-consume-lazy > Correct (block 1, consumed later)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Session {
 id: string;
}
declare function connectAnalytics(): Promise<Session>;

const session = new LazyPromise<Session>((resolve, reject) => {
 connectAnalytics().then(resolve, reject);
});

// Consumed later; executor runs on first await.
export async function getSession(): Promise<Session> {
 return await session;
}
