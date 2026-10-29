import { cancAsync, cancAwait } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';

function* subStep(prefix: string) {
  const p = CancelablePromise.resolve(`${prefix}-ok`);
  const res = yield* cancAwait(p);
  return res;
}

export const main = cancAsync(function* () {
  const result: string = yield* subStep('op');
  return result;
});
