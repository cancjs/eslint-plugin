import type { CancelablePromise } from '@cancjs/promise';

export class StructErrorOne extends Error {} // lint: require-error-discriminant:missingDiscriminant
export class StructErrorTwo extends Error {} // lint: require-error-discriminant:missingDiscriminant

export declare const p: CancelablePromise<string, StructErrorOne | StructErrorTwo>;

