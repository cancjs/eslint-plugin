// Source: lazy.md > canc/must-consume-lazy > Correct (execute consumption)
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
declare function loadProfile(id: string): Promise<Profile>;
declare function onHover(cb: () => void): void;

const profile = LazyPromise.try(loadProfile, 'user-1');

onHover(() => profile.execute());

export async function getProfile(): Promise<Profile> {
  return await profile;
}
