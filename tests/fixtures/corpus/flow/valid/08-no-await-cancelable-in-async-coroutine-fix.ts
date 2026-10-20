// Source: flow.md > canc/no-await-cancelable-in-async > Correct (block 1, coroutine conversion)
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

const refreshView = cancAsync(function* () {
  const results = yield* cancAwait(searchCancelable(query));
  const details = yield* cancAwait(fetchDetailsCancelable(results[0].id));
  // Plain-promise step stays chain-cancelable only (see canc/no-cancellation-gap).
  // eslint-disable-next-line canc/no-cancellation-gap
  const legacy = yield* cancAwait(legacyAnalytics());
  render(results, details, legacy);
});

