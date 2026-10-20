// Source: coroutine.md > canc/no-cancellation-gap (strict tier) > Correct (block 2, acknowledged gap)
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

interface Order {
  id: string;
}
declare function pullOrdersCancelable(): CancelablePromise<Order[]>;
declare function legacyPushOrders(): Promise<void>;

// Acknowledged gap: legacy API has no abort support; chain-level cancellation is the ceiling.
const syncOrders = cancAsync(function* () {
  yield* cancAwait(pullOrdersCancelable());
  // eslint-disable-next-line canc/no-cancellation-gap
  yield* cancAwait(legacyPushOrders());
});

