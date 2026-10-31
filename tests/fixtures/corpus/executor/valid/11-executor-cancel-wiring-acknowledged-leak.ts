// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Correct (block 2)
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

interface Stats {
  total: number;
}
declare function computeStatsNonAbortable(): Promise<Stats>;

// Acknowledged leak: the underlying API is not abortable; chain-level stop is the best available.
// eslint-disable-next-line canc/executor-cancel-wiring
const stats = new CancelablePromise<Stats>((resolve, reject) => {
  computeStatsNonAbortable().then(resolve, reject);
});

