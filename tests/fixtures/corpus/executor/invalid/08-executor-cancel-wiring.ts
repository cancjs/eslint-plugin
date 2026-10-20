// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Incorrect
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
declare function fetchProfile(userId: string, signal?: AbortSignal): Promise<Profile>;
declare const signalCapableButUnused: AbortSignal;

const profile = new CancelablePromise<Profile>((resolve, reject) => { // lint: executor-cancel-wiring no cancel wiring
  fetchProfile('user-1', signalCapableButUnused).then(resolve, reject);
});

