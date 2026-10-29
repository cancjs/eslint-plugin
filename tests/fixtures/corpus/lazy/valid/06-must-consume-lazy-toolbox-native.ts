// Source: lazy.md > canc/must-consume-lazy > Correct (toolbox-native import)
import { LazyPromise } from '@cancjs/toolbox-native';

interface Session {
  id: string;
}
declare function connectAnalytics(): Promise<Session>;

const session = new LazyPromise<Session>((resolve, reject) => {
  connectAnalytics().then(resolve, reject);
});

export async function getSession(): Promise<Session> {
  return await session;
}
