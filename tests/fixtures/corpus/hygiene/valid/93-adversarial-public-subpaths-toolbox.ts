// @ts-expect-error TS2307: package @cancjs/node has no fixture stubs
import { spawn } from '@cancjs/node/child-process';
// @ts-expect-error TS2307: subpath async-iter has no fixture stubs
import '@cancjs/toolbox/async-iter';
// @ts-expect-error TS2307: package @cancjs/unhandled-rejection has no fixture stubs
import '@cancjs/unhandled-rejection/register';

export function runProc(cmd: string) {
  return spawn(cmd);
}
