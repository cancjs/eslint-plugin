// options: {"additionalGenCoroutineFactories":["streamRows"]}
import { cancAwait } from '@cancjs/coroutine';

import { streamRows } from './lib/stream-rows';

declare function fetchPage(): Promise<string[]>;

export const rows = streamRows(function* () {
  const page = yield* cancAwait(fetchPage()); // lint: no-coroutine-dialect-mismatch
  for (const row of page) {
    yield row;
  }
});
