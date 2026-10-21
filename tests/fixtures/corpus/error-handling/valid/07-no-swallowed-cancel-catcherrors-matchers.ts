// Source: error-handling.md > canc/no-swallowed-cancel > Correct (catchErrors matcher list)
import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
  catchErrors,
  suppressErrors,
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
declare function render(results: unknown): void;

async function run() {
  const results = await catchErrors(catalogSearch, TimeoutError, isAbortError);
  if (results) {
    render(results);
  }
}
