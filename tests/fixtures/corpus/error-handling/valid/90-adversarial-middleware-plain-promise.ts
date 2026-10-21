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

interface HttpRequest {
  path: string;
}
interface HttpResponse {
  status: number;
}
declare function executeRequest(req: HttpRequest): Promise<HttpResponse>;
declare function reportError(err: unknown): void;

export function loggingMiddleware(req: HttpRequest): Promise<HttpResponse> {
  return executeRequest(req).catch((err: unknown) => {
    reportError(err);
    return { status: 500 };
  });
}
