import { cancAsync } from '@cancjs/coroutine';

export const run = cancAsync(function* () {
  throw new TypeError('Invalid argument'); // lint: prefer-canc-throw:preferCancThrow
});
