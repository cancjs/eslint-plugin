declare function work(): Promise<string>;

export function raceWithSignal(signal: AbortSignal): Promise<string> {
  let onAbort: (() => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', onAbort);
  });
  return Promise.race([work(), aborted]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}
