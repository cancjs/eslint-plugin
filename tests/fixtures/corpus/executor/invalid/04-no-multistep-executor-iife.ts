// Source: executor.md > canc/no-multistep-executor > Incorrect (block 2, async IIFE variant)
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

declare function stepOne(signal: AbortSignal): Promise<void>;
declare function stepTwo(signal: AbortSignal): Promise<void>;

// Multi-step workflow smuggled in through an async IIFE: trips both canc/no-async-executor
// (async wrapper) and canc/no-multistep-executor (two operations in one executor).
const checkout = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  (async () => {
  await stepOne(controller.signal); // lint: no-multistep-executor first operation
  await stepTwo(controller.signal); // lint: no-multistep-executor second operation in the same executor
  resolve();
  })().catch(reject);
});

