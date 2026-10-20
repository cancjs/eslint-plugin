// Source: coroutine.md > canc/prefer-cancawait > Correct (block 3, sub-generator delegation)
import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenDelegate } from '@cancjs/coroutine/gen';
import {
  cancelify,
  promisify,
  promisifyAll,
  LazyPromise,
  createLazyPromise,
  AbortError,
  isAbortError,
  TimeoutError,
  isTimeoutError,
  createCatchError,
  createSuppressError,
  catchAbort,
  suppressAbort,
  catchTimeout,
  suppressTimeout,
} from '@cancjs/toolbox';

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

