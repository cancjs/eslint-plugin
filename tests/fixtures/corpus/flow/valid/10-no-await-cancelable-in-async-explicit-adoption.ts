// Source: flow.md > canc/no-await-cancelable-in-async > Correct (block 3, explicit adoption)
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

interface Report {
  id: string;
}
declare function buildReportCancelable(): CancelablePromise<Report>;

// Explicit adoption also satisfies this rule (rarely what you want, but visible and deliberate).
async function bridgeToLegacyCode(): Promise<Report> {
  return await (buildReportCancelable() as Promise<Report>);
}

