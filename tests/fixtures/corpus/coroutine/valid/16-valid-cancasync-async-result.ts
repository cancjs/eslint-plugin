// Source: coroutine.md > canc/valid-cancasync > Correct (AsyncResult annotation)
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

type AsyncResult<T, E = unknown> = Generator<unknown, T, unknown>;

interface User {
  id: string;
}
declare function fetchUserCancelable(): CancelablePromise<User>;

const load = cancAsync(function* (): AsyncResult<User, Error> {
  const user = yield* cancAwait(fetchUserCancelable());
  return user;
});

void load;
