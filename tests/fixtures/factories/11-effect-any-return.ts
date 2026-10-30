// options: {"additionalCoroutineFactories":["useCancelableEffect"]}
import { cancAwait } from '@cancjs/coroutine';

import { useCancelableEffect } from './lib/use-cancelable-effect';

declare function loadUser(): Promise<string>;
declare function render(name: string): void;

useCancelableEffect(function* (): any { // lint: valid-cancasync
  const name = yield* cancAwait(loadUser());
  render(name);
}, []);
