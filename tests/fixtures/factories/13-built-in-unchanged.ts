// options: {"additionalCoroutineFactories":["useCancelableEffect"]}
import { cancAsync, cancAwait } from '@cancjs/coroutine';

declare function loadUser(): Promise<string>;

export const load = cancAsync(function* () {
  yield cancAwait(loadUser()); // lint: no-unstarred-cancawait // lint-baseline: no-unstarred-cancawait
});
