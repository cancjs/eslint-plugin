import { FooError } from './failure-test-cases.js';

declare const FAILURE: unique symbol;

declare class CancelablePromise<T, E = unknown> {
  readonly [FAILURE]?: E;
  readonly value?: T;
}

export type UserSymbolCarrier = { readonly [FAILURE]?: FooError };
export type LocalNamedCarrier = CancelablePromise<number, FooError>;

export class SubstringBrandError extends Error {
  readonly MY_CANCEL_ERROR_BRAND = 1;
}

const CANCEL_ERROR_BRAND = Symbol('local');
export class LocalNamedSymbolError extends Error {
  readonly [CANCEL_ERROR_BRAND] = true;
}

export class StringKeyedBrandError extends Error {
  readonly '@cancjs/promise:CancelError' = true;
}
