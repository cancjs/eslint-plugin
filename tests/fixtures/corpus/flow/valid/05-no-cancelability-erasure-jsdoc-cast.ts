// Source: flow.md > canc/no-cancelability-erasure > Correct (block 5, JSDoc cast in checkJs)
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

interface Dashboard {
  id: string;
}
declare function loadDashboard(): CancelablePromise<Dashboard>;
declare function trackPromise(p: Promise<Dashboard>): void;

// JS file with type info (checkJs): a JSDoc cast is the `as` form and is sanctioned like it.
// Reproduced here in a .ts file for corpus uniformity; the JSDoc cast syntax parses the same way.
const adopted = /** @type {Promise<Dashboard>} */ (loadDashboard());
trackPromise(adopted);

