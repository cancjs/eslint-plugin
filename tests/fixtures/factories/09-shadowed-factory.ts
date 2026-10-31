// options: {"additionalCoroutineFactories":[{"name":"useCancEffect","source":"@cancjs/react"}]}
import { cancAwait } from '@cancjs/coroutine';
import { useCancEffect } from '@cancjs/react';

declare function loadUser(): Promise<string>;

export { useCancEffect };

export function mount(useCancEffect: (body: () => Generator) => void): void {
  useCancEffect(function* () {
    yield cancAwait(loadUser());
  });
}
