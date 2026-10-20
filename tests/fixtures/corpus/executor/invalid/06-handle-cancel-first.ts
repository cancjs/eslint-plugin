// Source: executor.md > canc/handle-cancel-first > Incorrect
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
declare function openStream(): Promise<Stream>;
declare function readAll(stream: Stream): Promise<Report>;

const download = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  openStream().then((stream) => {
  handleCancel(() => stream.destroy()); // lint: handle-cancel-first registered after an async gap
  readAll(stream).then(resolve, reject);
  }, reject);
});

