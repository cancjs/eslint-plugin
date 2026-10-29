import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }

declare const p: CancelablePromise<string, ErrorA | ErrorB>;

export function load(): CancelablePromise<string, ErrorA> { // lint: no-failure-widening:failureWidening
  return p as any;
}
