// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Correct (block 3, adopted cancelable)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface User {
 id: string;
}
declare function fetchUserCancelable(): CancelablePromise<User>;
declare function auditUserCancelable(userId: string): CancelablePromise<void>;

// Handler returns a CancelablePromise: adoption carries the cancel, so this is not a gap.
const chain = fetchUserCancelable().then((user) => auditUserCancelable(user.id));
