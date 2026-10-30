import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

class DatabaseError extends Error {
  readonly kind = 'DatabaseError';
}

declare function queryData(): CancelablePromise<string[], DatabaseError>;
declare function logToMonitoring(error: unknown): void;

export const withLoggingMiddleware = cancAsync(function* () {
  try {
    return yield* cancAwait(queryData());
  } catch (err) {
    logToMonitoring(err);
    throw err;
  }
});
