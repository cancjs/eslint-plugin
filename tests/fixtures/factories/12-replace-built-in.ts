// options: {"coroutineFactories":["onlyMine"]}
import { cancAsync, cancAwait } from '@cancjs/coroutine';

import { onlyMine } from './lib/only-mine';

declare function loadUser(): Promise<string>;

export const viaBuiltIn = cancAsync(function* () {
  yield cancAwait(loadUser()); // lint-baseline: no-unstarred-cancawait
});

export const viaOwn = onlyMine(function* () {
  yield cancAwait(loadUser()); // lint: no-unstarred-cancawait
});
