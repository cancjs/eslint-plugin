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

declare function fetchData(): Promise<string>;

export const guarded = new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
  const timer = setTimeout(() => {
    reject(new TimeoutError('Request timed out'));
  }, 5000);

  handleCancel(() => {
    clearTimeout(timer);
  });

  fetchData().then(
    (res) => {
      clearTimeout(timer);
      resolve(res);
    },
    (err: unknown) => {
      clearTimeout(timer);
      reject(err);
    },
  );
});
