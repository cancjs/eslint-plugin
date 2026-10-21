// Source: flow.md > canc/no-cancelability-erasure > Correct (withFailure)
import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
  withFailure,
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
interface UserFailure {
  code: string;
}
declare function fetchUser(): CancelablePromise<User>;
declare function consumeUser(p: CancelablePromise<User, UserFailure>): void;

const userPromise = withFailure<UserFailure>()(fetchUser());
consumeUser(userPromise);
