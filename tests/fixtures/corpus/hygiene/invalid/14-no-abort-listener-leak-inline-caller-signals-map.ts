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


export async function firstAbort(signals: AbortSignal[]): Promise<void> {
  const waits = signals.map(
    (signal) =>
      new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted'))), // lint: no-abort-listener-leak:inlineListenerNoOnce the signals come from the caller
      ),
  );

  await Promise.race(waits);
}
