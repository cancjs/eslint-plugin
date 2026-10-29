import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error {}
class ErrorB extends Error {}

declare const p: CancelablePromise<string, ErrorA | ErrorB>;

export function load(): CancelablePromise<string, ErrorA> { // lint: no-failure-widening:failureWidening
  return p as any;
}
