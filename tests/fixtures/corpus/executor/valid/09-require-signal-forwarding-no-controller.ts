// Source: executor.md > canc/require-signal-forwarding > Correct (block 3, no controller at all)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Profile {
 id: string;
}
declare function fetchProfile(userId: string): Promise<Profile>;

// Also correct: no controller at all; cancellation stops the chain only.
// (Strict-tier canc/executor-cancel-wiring may still flag the unused handleCancel capacity;
// recommended tier accepts this.)
const profile = new CancelablePromise<Profile>((resolve, reject) => {
 fetchProfile('user-1').then(resolve, reject);
});
