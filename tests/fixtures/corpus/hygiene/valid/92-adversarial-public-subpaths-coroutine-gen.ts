import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
// @ts-expect-error TS2307: package @cancjs/node has no fixture stubs
import { readFile } from '@cancjs/node/fs';
// @ts-expect-error TS2307: package @cancjs/node has no fixture stubs
import { setTimeout as sleep } from '@cancjs/node/timers';

export const readGen = cancGenAsync(function* (path: string) {
  yield* sleep(10);
  const data = yield* cancGenAwait(readFile(path));
  return data;
});
