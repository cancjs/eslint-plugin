// Source: executor.md > canc/no-async-executor > Incorrect (block 1)
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

declare function fetchTitlesRaw(signal: AbortSignal): Promise<{ title: string }[]>;

const cancPromise = new CancelablePromise<string[]>(async (resolve, reject, { handleCancel }) => { // lint: no-async-executor async executor
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  try {
  const data = await fetchTitlesRaw(controller.signal);
  resolve(data.map((item) => item.title));
  } catch (err) {
  reject(err);
  }
});

