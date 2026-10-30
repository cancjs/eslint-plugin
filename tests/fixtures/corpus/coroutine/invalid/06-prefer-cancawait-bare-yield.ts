// Source: coroutine.md > canc/prefer-cancawait > Incorrect (block 1, bare yield promise)
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
declare function fetchUserCancelable(): CancelablePromise<User>;

const load = cancAsync(function* () {
  const user = yield fetchUserCancelable(); // lint: prefer-cancawait:preferCancAwait untyped step, prefer yield* cancAwait()
  return user;
});

