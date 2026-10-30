// Source: lazy.md > Executor rules applied to lazy executors > Correct (block 1, teardown return)
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
interface FeedSocket {
  onData(cb: (data: Feed) => void): void;
  onError(cb: (err: unknown) => void): void;
  close(): void;
}
declare function openFeedSocket(): FeedSocket;

export const feed = new LazyPromise<Feed>((resolve, reject) => {
  const socket = openFeedSocket();
  socket.onData(resolve);
  socket.onError(reject);
  return () => socket.close(); // teardown function return: sanctioned lazy contract
});

