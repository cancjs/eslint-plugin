// Section: canc/adversarial
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

interface TaskController {
  abort(): void;
}

declare function forwardTask(controller: TaskController): Promise<string>;
declare function createTaskController(): TaskController;

export const task = new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
  const controller = createTaskController();
  handleCancel(() => controller.abort());
  forwardTask(controller).then(resolve, reject);
});
