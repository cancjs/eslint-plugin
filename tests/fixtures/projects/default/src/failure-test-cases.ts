import type { CancelablePromise, Unlisted } from '@cancjs/promise';
import { CancelError } from '@cancjs/promise';

export class FooError extends Error {}
export class SubCancelError extends CancelError {}
export class PlainError extends Error {}
export type InterCancelError = CancelError & { x: 1 };

export type CaseFoo = CancelablePromise<number, FooError>;
export type CaseFooOpen = CancelablePromise<number, FooError | Unlisted>;
export type CaseDefault = CancelablePromise<number>;
export type CaseAny = CancelablePromise<number, any>;
export type CaseNever = CancelablePromise<number, never>;
