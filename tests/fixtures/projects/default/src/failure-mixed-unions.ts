import type { CancelablePromise } from '@cancjs/promise';

import { FooError } from './failure-test-cases.js';

export class BarError extends Error {}

export type MixedWithObject = CancelablePromise<string, FooError> | { z: 1 };
export type MixedWithString = CancelablePromise<string, FooError> | string;
export type CarrierUnion = CancelablePromise<string, FooError> | CancelablePromise<string, BarError>;
export type CarrierOrUndefined = CancelablePromise<string, FooError> | undefined;
