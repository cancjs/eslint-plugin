// Source: executor.md > canc/require-signal-forwarding > Correct (block 2, controller forwarded)
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
declare function fetchProfile(userId: string, controller: AbortController): Promise<Profile>;

// Also correct: some APIs accept the whole controller and read `.signal` themselves. Passing the
// controller counts as forwarding, so canc/require-signal-forwarding does not fire.
// (Handing out a controller gives the callee abort() over a controller it does not own, a design
// smell that strict-tier canc/prefer-signal-over-controller flags separately; pass `.signal`.)
const profile = new CancelablePromise<Profile>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchProfile('user-1', controller).then(resolve, reject);
});
