// Source: executor.md > canc/no-multistep-executor > Incorrect (block 1)
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

const checkout = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  reserveStock(controller.signal) // lint: no-multistep-executor second operation started in the same executor below
  .then(() => chargeCard(controller.signal))
  .then(() => resolve(), reject);
});

