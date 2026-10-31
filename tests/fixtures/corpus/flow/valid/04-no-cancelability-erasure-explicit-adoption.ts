// Source: flow.md > canc/no-cancelability-erasure > Correct (block 4, explicit adoption forms)
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
declare function trackPromise(p: Promise<unknown>): void;

// Explicit adoption: sanctioned downgrade forms that state the intent in code,
// so the rule accepts them without a disable comment.
trackPromise(Promise.resolve(loadDashboard()));
trackPromise(new Promise((resolve) => { resolve(loadDashboard()); }));
trackPromise(loadDashboard() as Promise<Dashboard>);
trackPromise(loadDashboard() as unknown as Promise<Dashboard>); // double assertion, still explicit
trackPromise(<Promise<Dashboard>>loadDashboard()); // angle-bracket cast, same as `as` (allowAsCast)

