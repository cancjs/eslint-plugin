import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error {}
class ErrorB extends Error {}
interface Unlisted {
  readonly _cancUnlisted: true;
}

declare const openP: CancelablePromise<string, ErrorA | Unlisted>;
export const coerced = openP as CancelablePromise<string, ErrorB | Unlisted>; // lint: no-failure-widening:failureWidening
