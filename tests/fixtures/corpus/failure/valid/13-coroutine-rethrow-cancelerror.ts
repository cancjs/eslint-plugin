import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import { CancelError } from '@cancjs/promise';

declare function doWork(): CancelablePromise<void>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(doWork());
  } catch (e) {
    throw e;
  }

  const throwInPlainNested = () => {
    throw new Error('plain nested error');
  };
  throwInPlainNested();

  if (Math.random() > 1) {
    throw new CancelError();
  }
});
