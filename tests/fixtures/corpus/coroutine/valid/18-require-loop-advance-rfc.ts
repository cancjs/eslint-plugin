// Source: coroutine.md > canc/require-loop-advance > Correct (block 1)
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
  done?: boolean;
  condition?: boolean;
}
declare function save(item: Item): CancelablePromise<void>;
declare const source: AsyncIterable<Item>;

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  for (const item of yield* cancForAwait(source)) {
    yield* cancForAwait.next();
    if (item.skip) continue;
    if (item.done) break;
    yield* cancAwait(save(item));
  }
});
