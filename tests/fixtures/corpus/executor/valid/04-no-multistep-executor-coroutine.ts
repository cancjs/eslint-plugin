// Source: executor.md > canc/no-multistep-executor > Correct (block 2, coroutine form)
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

declare function reserveStock(signal: AbortSignal): Promise<void>;
declare function chargeCard(signal: AbortSignal): Promise<void>;

function reserveStockCancelable(): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  reserveStock(controller.signal).then(resolve, reject);
  });
}

function chargeCardCancelable(): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  chargeCard(controller.signal).then(resolve, reject);
  });
}

// Coroutine form: same granularity, reads like async/await.
const checkout = cancAsync(function* () {
  yield* cancAwait(reserveStockCancelable());
  yield* cancAwait(chargeCardCancelable());
})();

