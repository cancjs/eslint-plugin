import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import { suppressErrors } from '@cancjs/promise';

class SpecificErrorA extends Error {
  readonly kind = 'SpecificErrorA';
}
class SpecificErrorB extends Error {
  readonly kind = 'SpecificErrorB';
}

declare function multiFailureCall(): CancelablePromise<string, SpecificErrorA | SpecificErrorB>;

export const handledWithHelper = cancAsync(function* () {
  try {
    return yield* cancAwait(multiFailureCall());
  } catch (err) {
    suppressErrors(err, SpecificErrorA, SpecificErrorB);
  }
});
