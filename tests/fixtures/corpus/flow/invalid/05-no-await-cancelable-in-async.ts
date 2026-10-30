// Source: flow.md > canc/no-await-cancelable-in-async > Incorrect
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
interface Details {
  id: string;
}
declare const query: string;
declare function searchCancelable(query: string): CancelablePromise<SearchResult[]>;
declare function fetchDetailsCancelable(id: string): CancelablePromise<Details>;
declare function legacyAnalytics(): Promise<void>;
declare function render(results: SearchResult[], details: Details, legacy: void): void;

async function refreshView(): Promise<void> {
  const results = await searchCancelable(query); // lint: no-await-cancelable-in-async cancelable consumed via await in plain async fn
  const details = await fetchDetailsCancelable(results[0].id); // lint: no-await-cancelable-in-async
  const legacy = await legacyAnalytics(); // plain promise mixed into the same flow
  render(results, details, legacy);
}

