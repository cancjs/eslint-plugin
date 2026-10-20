// Source: flow.md > canc/no-await-cancelable-in-async > Correct (block 2, boundary form)
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

interface SearchResult {
  id: string;
}
declare const query: string;
declare function runSearch(query: string): CancelablePromise<SearchResult[]>;
declare function showStatus(msg: string): void;
declare function render(outcome: SearchResult[]): void;
declare const button: { addEventListener(type: string, cb: () => void): void };
declare const cancelButton: { addEventListener(type: string, cb: () => void, opts?: { once?: boolean }): void };

// Boundary form: an event handler OWNS the cancellation and consumes the flow terminally.
button.addEventListener('click', async () => {
  const search = runSearch(query);
  cancelButton.addEventListener('click', () => void search.cancel(), { once: true });
  const outcome = await catchCancel(search); // terminal consumption: CancelError becomes a value
  if (isCancelError(outcome)) {
  showStatus('Search canceled');
  return;
  }
  render(outcome);
});

