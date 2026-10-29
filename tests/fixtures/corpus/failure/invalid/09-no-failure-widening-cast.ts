import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error {}
class ErrorB extends Error {}

declare const p: CancelablePromise<string, ErrorA | ErrorB>;
export const widened: CancelablePromise<string, ErrorA> = p as any; // lint: no-failure-widening:failureWidening
