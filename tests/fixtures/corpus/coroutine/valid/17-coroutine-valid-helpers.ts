// Source: coroutine.md > Coroutine helpers > Correct (throw, loop handle, next)
import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
} from '@cancjs/promise';
import * as canc from '@cancjs/coroutine';
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

interface Item {
  id: string;
}

const runWithHelpers = cancAsync(function* (source: AsyncIterable<Item>) {
  try {
    const loop = yield* cancForAwait(source);
    const first = yield* loop.next();
    const second = yield* cancForAwait.next(loop);
    void first;
    void second;
  } catch (e) {
    return yield* canc.throw(e);
  }
});

void runWithHelpers;
