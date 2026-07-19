// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Correct (block 1)
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
declare function fetchProfile(userId: string, signal: AbortSignal): Promise<Profile>;

const profile = new CancelablePromise<Profile>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchProfile('user-1', controller.signal).then(resolve, reject);
});
