import { cancThrow } from '@cancjs/coroutine';
import { CancelablePromise, isErrorOf, withFailure } from '@cancjs/promise';

export class RealTypeArgError extends Error {}
export class RealWithFailureError extends Error {}
export class RealIsErrorOfError extends Error {}
export class RealThrowError extends Error {}
export class RealFailError extends Error {}

export declare function typed(): CancelablePromise<void, RealTypeArgError>;

export function usage(error: unknown): void {
  withFailure<RealWithFailureError>();
  isErrorOf(error, RealIsErrorOfError);
  cancThrow(new RealThrowError());
  CancelablePromise.fail(new RealFailError());
}
