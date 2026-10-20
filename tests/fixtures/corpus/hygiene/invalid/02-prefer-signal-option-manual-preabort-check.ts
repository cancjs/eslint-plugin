// Source: hygiene.md > canc/prefer-signal-option > Incorrect (block 2, manual pre-abort check)
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

declare class CancelError extends Error {}
interface Quote {
  id: string;
}
declare function fetchQuotes(): Promise<Quote[]>;

function loadQuotes(signal: AbortSignal): CancelablePromise<Quote[]> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
  if (signal.aborted) { // lint: prefer-signal-option pre-abort handled by the signal option
  reject(new CancelError());
  return;
  }
  fetchQuotes().then(resolve, reject);
  });
}

