// options: {"additionalGenCoroutineFactories":["useCancelableEffect"]}
import { cancAwait } from '@cancjs/coroutine';

import { useCancelableEffect } from './lib/use-cancelable-effect';

declare function loadUser(): Promise<string>;
declare function render(name: string): void;

useCancelableEffect(function* () {
  const name = yield* cancAwait(loadUser()); // lint: no-coroutine-dialect-mismatch
  render(name);
}, []);
