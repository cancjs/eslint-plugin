import type CancelablePromise from '@cancjs/promise';
import type { Unlisted } from '@cancjs/promise';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare const openP: CancelablePromise<string, ErrorA | Unlisted>;
export const coerced = openP as CancelablePromise<string, ErrorB | Unlisted>; // lint: no-failure-widening:failureWidening
