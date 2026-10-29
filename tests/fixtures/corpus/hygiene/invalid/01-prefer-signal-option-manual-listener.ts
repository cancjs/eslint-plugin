// Source: hygiene.md > canc/prefer-signal-option > Incorrect (block 1, manual listener never removed)
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

interface Quote {
  id: string;
}
declare function fetchQuotes(signal: AbortSignal): Promise<Quote[]>;

function loadQuotes(signal: AbortSignal): CancelablePromise<Quote[]> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
    signal.addEventListener('abort', () => controller.abort()); // lint: prefer-signal-option:manualSignalWiring listener never removed
    fetchQuotes(controller.signal).then(resolve, reject);
  });
}

