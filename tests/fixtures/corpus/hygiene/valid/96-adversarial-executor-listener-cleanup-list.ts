declare function work(): Promise<string>;

export async function raceWithSignals(signals: AbortSignal[]): Promise<string> {
  const cleanup: Array<{ signal: AbortSignal; listener: () => void }> = [];
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      signals.forEach((signal) => {
        const listener = () => reject(new Error('aborted'));
        signal.addEventListener('abort', listener);
        cleanup.push({ signal, listener });
      });
    });
    return await Promise.race([work(), aborted]);
  } finally {
    cleanup.forEach(({ signal, listener }) => {
      signal.removeEventListener('abort', listener);
    });
  }
}
