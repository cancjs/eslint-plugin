import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }

declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) { // lint: exhaustive-catch:unhandledFailure
    console.error(e);
  }
});
