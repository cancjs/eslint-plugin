// options: {"additionalCoroutineFactories":[{"name":"useCancEffect","source":"@cancjs/react"}]}
import { cancAwait } from '@cancjs/coroutine';

import { useCancEffect } from './lib/use-cancelable-effect';

declare function loadUser(): Promise<string>;

useCancEffect(function* () {
  yield cancAwait(loadUser());
}, []);
