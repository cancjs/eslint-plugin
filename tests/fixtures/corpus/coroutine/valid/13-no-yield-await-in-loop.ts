// Source: coroutine.md > canc/no-yield-await-in-loop (strict tier) > Correct
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
declare function fetchUserCancelable(id: string): CancelablePromise<User>;

const loadAll = cancAsync(function* (ids: string[]) {
 return yield* cancAwait.all(ids.map((id) => fetchUserCancelable(id)));
});
