// Source: flow.md > canc/no-cancelability-erasure > Correct (block 3, satisfies)
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
declare function onViewTeardown(cb: () => void): void;

// satisfies checks Promise-compatibility WITHOUT downgrading: the value stays CancelablePromise.
// This is the tool to reach for when you only want the compatibility assertion.
const stillCancelable = fetchUserCancelable() satisfies Promise<User>;
onViewTeardown(() => void stillCancelable.cancel());
