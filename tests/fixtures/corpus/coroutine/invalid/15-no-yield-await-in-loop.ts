// Source: coroutine.md > canc/no-yield-await-in-loop (strict tier) > Incorrect
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
declare function fetchUserCancelable(id: string): CancelablePromise<User>;

const loadAll = cancAsync(function* (ids: string[]) {
  const users: User[] = [];
  for (const id of ids) {
  users.push(yield* cancAwait(fetchUserCancelable(id))); // lint: no-yield-await-in-loop independent steps serialized
  }
  return users;
});

