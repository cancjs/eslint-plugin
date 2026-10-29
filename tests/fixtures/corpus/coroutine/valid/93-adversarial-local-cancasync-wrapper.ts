// Local helper not from @cancjs/coroutine
function cancAsync<T>(fn: () => Generator<any, T, any>): () => Promise<T> {
  return async () => {
    const gen = fn();
    return gen.next().value as T;
  };
}

export const executeTask = cancAsync(function* () {
  yield 1;
  return 'done';
});
