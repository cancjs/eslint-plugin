import { LazyPromise } from '@cancjs/toolbox';

export function createService(): LazyPromise<string> {
  const lazyService = LazyPromise.resolve('active');
  return lazyService;
}

export async function startService(): Promise<string> {
  const svc = createService();
  return await svc;
}
