declare function callRemote(signal: AbortSignal): Promise<string>;

export function callWithSignal(signal: AbortSignal): Promise<string> {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  return callRemote(signal).finally(() => {
    signal.removeEventListener('abort', onAbort);
  });
}
