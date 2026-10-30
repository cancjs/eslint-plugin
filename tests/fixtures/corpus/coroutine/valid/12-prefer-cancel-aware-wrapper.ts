// Source: coroutine.md > canc/prefer-cancel-aware-wrapper (strict tier) > Correct
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

interface Result {
  id: string;
}
declare function rawFetch(orderId: string, signal: AbortSignal): Promise<Result>;

const fetchOrder = cancelify(({ signal }, orderId: string) => rawFetch(orderId, signal));

const run = cancAsync(function* (orderId: string) {
  return yield* cancAwait(fetchOrder(orderId)); // cancel the coroutine, the wrapped op aborts
});

