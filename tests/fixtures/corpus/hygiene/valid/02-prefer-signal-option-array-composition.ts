// Source: hygiene.md > canc/prefer-signal-option > Correct (block 2, array composition)
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
declare const userSignal: AbortSignal;

// Composition: array form, first abort wins, listeners cleaned up on settle.
const quotes = new CancelablePromise<Quote[]>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchQuotes(controller.signal).then(resolve, reject);
}, { signal: [userSignal, AbortSignal.timeout(5000)] });

