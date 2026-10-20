// Source: executor.md > canc/require-signal-forwarding > Correct (block 3, no controller at all)
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

interface Profile {
  id: string;
}
declare function fetchProfile(userId: string): Promise<Profile>;

// Also correct: no controller at all; cancellation stops the chain only.
// (Strict-tier canc/executor-cancel-wiring may still flag the unused handleCancel capacity;
// recommended tier accepts this.)
const profile = new CancelablePromise<Profile>((resolve, reject) => {
  fetchProfile('user-1').then(resolve, reject);
});

