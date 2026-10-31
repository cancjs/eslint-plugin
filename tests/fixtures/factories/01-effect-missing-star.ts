// options: {"additionalCoroutineFactories":["useCancelableEffect"]}
import { cancAwait } from '@cancjs/coroutine';

import { useCancelableEffect } from './lib/use-cancelable-effect';

declare function loadUser(): Promise<string>;

useCancelableEffect(function* () {
  yield cancAwait(loadUser()); // lint: no-unstarred-cancawait
}, []);
