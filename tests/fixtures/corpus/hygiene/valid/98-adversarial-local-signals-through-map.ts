export async function firstAbort(): Promise<void> {
  const first = new AbortController();
  const second = new AbortController();
  const signals = [first.signal, second.signal];

  const waits = signals.map(
    (signal) =>
      new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
  );

  first.abort();
  await Promise.race(waits);
}
