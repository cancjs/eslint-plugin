// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Incorrect (block 2, chain gap)
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
declare function legacyAudit(userId: string): Promise<void>;

const chain = fetchUserCancelable().then((user) => legacyAudit(user.id)); // lint: gap in the chain
