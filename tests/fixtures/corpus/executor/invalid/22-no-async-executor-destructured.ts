// Section: canc/no-async-executor
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

declare function doWork(signal?: AbortSignal): Promise<void>;

const cancPromise = new CancelablePromise<void>(async (resolve, reject, { handleCancel }) => { // lint: no-async-executor:asyncExecutor
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  await doWork(controller.signal);
  resolve();
});
