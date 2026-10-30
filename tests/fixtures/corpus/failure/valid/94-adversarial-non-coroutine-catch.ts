import type CancelablePromise from '@cancjs/promise';

class WorkerError extends Error {
  readonly kind = 'WorkerError';
}

declare function runWorker(): CancelablePromise<number, WorkerError>;

export async function nonCoroutineHelper(): Promise<number> {
  try {
    return await runWorker();
  } catch (err) {
    console.warn('Worker failed:', err);
    return 0;
  }
}
