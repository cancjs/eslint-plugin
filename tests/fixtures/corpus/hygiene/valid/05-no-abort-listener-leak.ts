// Source: hygiene.md > canc/no-abort-listener-leak (CFG rule, lostcancel-style) > Correct
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

declare function pollUntil(cb: () => boolean): Promise<void> & { finally(cb: () => void): unknown };

function pollWithSignal(signal: AbortSignal) {
  let stopped = false;
  const onAbort = () => {
  stopped = true;
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return pollUntil(() => stopped).finally(() => signal.removeEventListener('abort', onAbort));
}

