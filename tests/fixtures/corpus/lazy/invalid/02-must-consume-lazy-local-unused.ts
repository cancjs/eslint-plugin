// Source: lazy.md > canc/must-consume-lazy > Incorrect (block 2, local unused before return)
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

declare function prefetchAssets(): Promise<void>;

function warmCache() {
  const warmup = new LazyPromise<void>((resolve, reject) => {
  prefetchAssets().then(resolve, reject);
  });
  // lint: must-consume-lazy local lazy promise never consumed; function returns without starting it
}

