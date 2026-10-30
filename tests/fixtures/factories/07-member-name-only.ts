// options: {"additionalCoroutineFactories":["useCancelableEffect"]}
import { cancAwait } from '@cancjs/coroutine';

import { hooks } from './lib/hooks';

declare function loadUser(): Promise<string>;

hooks.useCancelableEffect(function* () {
  yield cancAwait(loadUser()); // lint: no-unstarred-cancawait
}, []);
