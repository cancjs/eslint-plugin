// Source: coroutine.md > canc/require-loop-advance > Incorrect (block 3)
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

interface Item {
  id: string;
  skip?: boolean;
  condition?: boolean;
}
declare function save(item: Item): CancelablePromise<void>;
declare const source: AsyncIterable<Item>;

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  const loop = yield* cancForAwait(source);
  for (const item of loop) {
    if (item.condition) {
      yield* loop.next();
    }
    if (item.skip) continue; // lint: require-loop-advance:continueBeforeAdvance
    yield* cancAwait(save(item));
  }
});
