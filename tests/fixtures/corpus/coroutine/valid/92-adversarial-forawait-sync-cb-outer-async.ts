import { cancAsync, cancForAwait } from '@cancjs/coroutine';

declare function saveItemAsync(item: number): Promise<void>;

export const processStream = cancAsync(function* (source: AsyncIterable<number>) {
  const collected: number[] = [];
  yield* cancForAwait(source, (item: number) => {
    collected.push(item);
  });

  const upload = async () => {
    for (const val of collected) {
      await saveItemAsync(val);
    }
  };

  return upload;
});
