// Source: lazy.md > canc/must-consume-lazy > Correct (toolbox-native import)
import { LazyPromise } from '@cancjs/toolbox-native';

interface Session {
  id: string;
}
declare function connectAnalytics(signal?: AbortSignal): Promise<Session>;

const session = new LazyPromise<Session>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  connectAnalytics(controller.signal).then(resolve, reject);
});

export async function getSession(): Promise<Session> {
  return await session;
}
