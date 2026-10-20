// Source: flow.md > Floating cancelables (interop guidance, not an own rule)
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

declare const query: string;
declare function runSearch(query: string): CancelablePromise<unknown>;
declare const searchPromise: CancelablePromise<unknown>;

async function demo() {
  void runSearch(query); // would be reported by no-floating-promises if not discarded, correctly

  void searchPromise.cancel(); // sanctioned fire-and-forget cancel
  await searchPromise.cancel(); // when cleanup completion matters
}

