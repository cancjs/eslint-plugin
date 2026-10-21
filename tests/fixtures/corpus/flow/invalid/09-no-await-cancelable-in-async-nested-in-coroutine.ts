// Source: flow.md > canc/no-await-cancelable-in-async > Incorrect (nested async fn in coroutine)
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
declare function fetchUser(): CancelablePromise<User>;

const routine = cancAsync(function* () {
  const innerAsync = async () => {
    const user = await fetchUser(); // lint: no-await-cancelable-in-async:awaitErasesCancelability
    return user.id;
  };
  yield* cancAwait(innerAsync());
});
