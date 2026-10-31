// options: {"additionalCoroutineFactories":["useCancelableEffect"]}
import { useCancelableEffect } from './lib/use-cancelable-effect';

declare function loadUser(): Promise<string>;
declare function render(name: string): void;

useCancelableEffect(async () => {
  render(await loadUser());
}, []);
