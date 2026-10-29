// Source: hygiene.md > canc/prefer-signal-accessor > Incorrect (reading getSignal())
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

function makeTask(): CancelablePromise<void> {
  return new CancelablePromise((resolve, _reject, ctx) => {
    const signal = ctx.getSignal(); // lint: prefer-signal-accessor:preferSignalAccessor getSignal() is deprecated
    void signal;
    resolve();
  });
}

void makeTask;
