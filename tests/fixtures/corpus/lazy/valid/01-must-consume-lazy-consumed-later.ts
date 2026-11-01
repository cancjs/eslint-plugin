// Source: lazy.md > canc/must-consume-lazy > Correct (block 1, consumed later)
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

interface Session {
  id: string;
}
declare function connectAnalytics(signal: AbortSignal): Promise<Session>;

const session = new LazyPromise<Session>((resolve, reject, { signal }) => {
  connectAnalytics(signal).then(resolve, reject);
});

// Consumed later; executor runs on first await.
export async function getSession(): Promise<Session> {
  return await session;
}

