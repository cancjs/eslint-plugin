// Source: coroutine.md > canc/prefer-cancawait > Correct (block 3, sub-generator delegation)
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
interface Post {
 id: string;
}
declare function fetchUserCancelable(id: string): CancelablePromise<User>;
declare function fetchPostsCancelable(id: string): CancelablePromise<Post[]>;
declare function render(pair: { user: User; posts: Post[] }): unknown;

// Delegation to a sub-generator is fine: composition, not an untyped step.
function* loadPair(id: string) {
 const user = yield* cancAwait(fetchUserCancelable(id));
 const posts = yield* cancAwait(fetchPostsCancelable(id));
 return { user, posts };
}

const loadProfile = cancAsync(function* (id: string) {
 const pair = yield* loadPair(id);
 return render(pair);
});
