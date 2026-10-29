// Error class with only a static member, used as a declared failure type
import type CancelablePromise from '@cancjs/promise';

export class StaticOnlyError extends Error {
  static readonly DEFAULT_CODE = 'STATIC_ERR';
}

export declare function fail(): CancelablePromise<void, StaticOnlyError>;

export function reportStatic(): string {
  return StaticOnlyError.DEFAULT_CODE;
}
