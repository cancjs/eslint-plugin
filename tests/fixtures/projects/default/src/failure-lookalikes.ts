declare class CancelablePromise<T, E = unknown> {
  static fail(error: unknown): void;
  readonly value?: T;
  readonly failure?: E;
}
declare function withFailure<E>(): void;
declare function isErrorOf(error: unknown, ...matchers: unknown[]): boolean;
declare function cancThrow(error: unknown): never;

export class LookTypeArgError extends Error {}
export class LookWithFailureError extends Error {}
export class LookIsErrorOfError extends Error {}
export class LookThrowError extends Error {}
export class LookFailError extends Error {}

export declare function typed(): CancelablePromise<void, LookTypeArgError>;

export function usage(error: unknown): void {
  withFailure<LookWithFailureError>();
  isErrorOf(error, LookIsErrorOfError);
  cancThrow(new LookThrowError());
  CancelablePromise.fail(new LookFailError());
}
