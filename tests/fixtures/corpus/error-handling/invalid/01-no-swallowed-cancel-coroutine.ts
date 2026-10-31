// Source: error-handling.md > canc/no-swallowed-cancel > Incorrect (block 1, coroutine form)
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

interface Product {
  id: string;
}
declare const catalogSearch: CancelablePromise<Product[]>;
declare function render(results: Product[]): void;
declare function showErrorToast(err: unknown): void;

// Coroutine form: the catch sees CancelError but treats it like any failure.
// (Written as coroutine so awaiting the cancelable is itself correct; a plain
// awaiting in an async function would trip canc/no-await-cancelable-in-async.)
const runSearch = cancAsync(function* () {
  try {
  const results = yield* cancAwait(catalogSearch); // CancelablePromise<Product[]>
  render(results);
  } catch (err) {
  showErrorToast(err); // lint: no-swallowed-cancel user-initiated cancel produces an error toast
  }
});

