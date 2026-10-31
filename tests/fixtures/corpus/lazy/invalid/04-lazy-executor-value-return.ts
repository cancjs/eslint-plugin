// Source: lazy.md > Executor rules applied to lazy executors > Incorrect (block 2, value return)
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
declare function openFeed(): Promise<Feed>;

const feed = new LazyPromise<Feed>((resolve, reject) => { // lint: must-consume-lazy
  return openFeed().then(resolve, reject); // lint: no-executor-return value return from executor (not a teardown)
});

