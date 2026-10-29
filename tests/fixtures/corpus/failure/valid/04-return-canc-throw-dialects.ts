import { cancAsync, cancThrow } from '@cancjs/coroutine';
import { cancGenAsync, cancGenThrow } from '@cancjs/coroutine/gen';

class CustomError extends Error {
  readonly code = 'CUSTOM' as const;
}

export const failAsync = cancAsync(function* () {
  return yield* cancThrow(new CustomError());
});

export const failGen = cancGenAsync(function* () {
  return yield* cancGenThrow(new CustomError());
});
