// Source: flow.md > canc/no-cancelability-erasure > Correct (block 3, satisfies)
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
declare function onViewTeardown(cb: () => void): void;

// satisfies checks Promise-compatibility WITHOUT downgrading: the value stays CancelablePromise.
// This is the tool to reach for when you only want the compatibility assertion.
const stillCancelable = fetchUserCancelable() satisfies Promise<User>;
onViewTeardown(() => void stillCancelable.cancel());

