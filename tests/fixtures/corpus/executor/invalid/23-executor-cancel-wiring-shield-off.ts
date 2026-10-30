// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Incorrect
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


declare function writeAuditLog(reportId: string): Promise<void>;

const audit = new CancelablePromise<void>(
  (resolve, reject) => { // lint: executor-cancel-wiring:noCancelWiring shield is off, so a cancel leaves the write running
    writeAuditLog('report-1').then(() => resolve(), reject);
  },
  { shield: false },
);

void audit;
