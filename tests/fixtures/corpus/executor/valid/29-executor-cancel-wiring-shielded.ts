// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Correct
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

// A shielded promise ignores cancel, so there is no underlying work to wire to a cancel handler.
const audit = new CancelablePromise<void>(
  (resolve, reject) => {
    writeAuditLog('report-1').then(() => resolve(), reject);
  },
  { shield: true },
);

void audit;
