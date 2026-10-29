import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }

declare const p: CancelablePromise<string, ErrorA | ErrorB>;
export const widened: CancelablePromise<string, ErrorA> = p as any; // lint: no-failure-widening:failureWidening
