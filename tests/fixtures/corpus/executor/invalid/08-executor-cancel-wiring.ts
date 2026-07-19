// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Incorrect
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
declare function fetchProfile(userId: string, signal?: AbortSignal): Promise<Profile>;
declare const signalCapableButUnused: AbortSignal;

const profile = new CancelablePromise<Profile>((resolve, reject) => { // lint: no cancel wiring
 fetchProfile('user-1', signalCapableButUnused).then(resolve, reject);
});
