// Source: flow.md > canc/no-await-cancelable-in-async > Correct (error-matcher boundary)
import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
  suppressErrors,
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

interface Data {
  payload: string;
}
interface UserFailure {
  code: string;
}
declare function fetchData(): CancelablePromise<Data, UserFailure>;
declare function isUserFailure(err: unknown): err is UserFailure;

async function boundaryRunner(): Promise<void> {
  const p = fetchData();
  await suppressErrors(p, isUserFailure);
  await catchCancel(p);
}
