// Source: coroutine.md > canc/no-coroutine-dialect-mismatch > Incorrect (block 2, cancIterAwait inside cancAsync)
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

const load = cancAsync(function* () {
 const user = yield* cancIterAwait(fetchUserCancelable()); // lint: cancIterAwait inside cancAsync
 return user;
});
