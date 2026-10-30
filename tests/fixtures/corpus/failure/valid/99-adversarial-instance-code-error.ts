// Error class told apart by an instance field, with a static default beside it
import type CancelablePromise from '@cancjs/promise';

export class CodedError extends Error {
  static readonly DEFAULT_CODE = 'CODED_ERR';
  readonly code: string = CodedError.DEFAULT_CODE;
}

export declare function fail(): CancelablePromise<void, CodedError>;

export function reportCode(error: CodedError): string {
  return error.code;
}
