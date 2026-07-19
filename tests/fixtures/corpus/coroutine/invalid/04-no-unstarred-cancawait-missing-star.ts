// Source: coroutine.md > canc/no-unstarred-cancawait > Incorrect (block 1, missing star)
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
 const user = yield cancAwait(fetchUserCancelable()); // lint: missing star, resumes with a generator object
 return user;
});
