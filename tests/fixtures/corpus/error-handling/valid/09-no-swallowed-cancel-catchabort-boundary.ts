// Source: error-handling.md > canc/no-swallowed-cancel > Correct (catchAbort and suppressTimeout boundary)
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

async function run() {
  const results = await suppressTimeout(catalogSearch);
  if (results) {
    render(results);
  }
}
