import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }

declare function withFailure<F1, F2 = never>(...matchers: any[]): (p: any) => any;
declare const p: CancelablePromise<string, ErrorA | ErrorB>;

export const form1 = withFailure<ErrorA>()(p);
export const form2 = withFailure<ErrorA, ErrorB>()(p);
export const form3 = withFailure(ErrorA, ErrorB)(p);

const withHttp = withFailure<ErrorA>();
export const form4 = withHttp(p);
