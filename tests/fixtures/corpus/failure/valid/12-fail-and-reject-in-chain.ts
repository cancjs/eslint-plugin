import CancelablePromise, { CancelError } from '@cancjs/promise';

class SpecificError extends Error {}

declare const p: CancelablePromise<string>;

export const c1 = p.then(() => {
  return (CancelablePromise as any).fail(new SpecificError());
});

export const c2 = p.catch(() => {
  return CancelablePromise.reject<never, SpecificError>(new SpecificError());
});

export const c3 = p.then(() => {
  try {
    // try block
  } catch (e) {
    throw e;
  }
});

export const c4 = p.then(() => {
  throw new CancelError();
});
