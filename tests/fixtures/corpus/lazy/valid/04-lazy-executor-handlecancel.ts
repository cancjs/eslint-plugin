// Source: lazy.md > Executor rules applied to lazy executors > Correct (block 2, handleCancel form)
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

interface Feed {
  id: string;
}
declare function openFeed(signal: AbortSignal): Promise<Feed>;

export const feed = new LazyPromise<Feed>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  openFeed(controller.signal).then(resolve, reject);
});

