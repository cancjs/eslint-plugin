// Source: hygiene.md > canc/no-abort-listener-leak (CFG rule, lostcancel-style) > Incorrect
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


declare function work(): Promise<string>;

export async function raceWithSignal(signal: AbortSignal): Promise<string> {
  const onAbort = () => {};
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', onAbort); // lint: no-abort-listener-leak:leakedAbortListener removed only when the race fails
      void reject;
    });
    return await Promise.race([work(), aborted]);
  } catch (error) {
    signal.removeEventListener('abort', onAbort);
    throw error;
  }
}
