import type CancelablePromise from '@cancjs/promise';
import { isCancelError } from '@cancjs/promise';

class WorkerError extends Error {
  readonly kind = 'WorkerError';
}

declare function runWorker(): CancelablePromise<number, WorkerError>;

export async function nonCoroutineHelper(): Promise<number> {
  try {
    return await Promise.resolve(runWorker());
  } catch (err) {
    if (isCancelError(err)) {
      throw err;
    }
    console.warn('Worker failed:', err);
    return 0;
  }
}
