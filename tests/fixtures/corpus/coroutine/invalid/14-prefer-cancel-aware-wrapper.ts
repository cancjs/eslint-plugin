// Source: coroutine.md > canc/prefer-cancel-aware-wrapper (strict tier) > Incorrect
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

interface Result {
  id: string;
}
declare function rawFetch(orderId: string, signal: AbortSignal): Promise<Result>;

const run = cancAsync(function* (orderId: string) {
  const { signal, abort } = createAbortSignal();
  let completed = false;
  try {
    const res = yield* cancAwait(makeCancelable(rawFetch(orderId, signal)));
    completed = true;
    return res;
  } finally {
    if (!completed) {
      abort(); // lint: prefer-cancel-aware-wrapper:manualCancelWiring hand-rolled cancel propagation
    }
  }
});

