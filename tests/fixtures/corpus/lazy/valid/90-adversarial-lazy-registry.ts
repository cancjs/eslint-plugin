import { LazyPromise } from '@cancjs/toolbox';

interface Registry {
  register(name: string, lazy: LazyPromise<unknown>): void;
}

declare const registry: Registry;

export function registerTask(): void {
  const task = LazyPromise.resolve(100);
  registry.register('compute', task);
}
