// Source: executor.md > canc/handle-cancel-first > Correct
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

interface Report {
  id: string;
}
interface Stream {
  destroy(): void;
}
declare function openStream(signal: AbortSignal): Promise<Stream>;
declare function readAll(stream: Stream, signal: AbortSignal): Promise<Report>;

const download = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  openStream(controller.signal)
  .then((stream) => readAll(stream, controller.signal))
  .then(resolve, reject);
});

