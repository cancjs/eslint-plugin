import type CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string>;

function asyncHandler(_res: string): CancelablePromise<number> {
  return null as any;
}

function catchHandler(_err: unknown): CancelablePromise<string> {
  return null as any;
}

export const c1 = p.then(asyncHandler);
export const c2 = p.catch(catchHandler);
