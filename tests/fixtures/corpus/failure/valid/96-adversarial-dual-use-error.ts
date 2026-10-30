import type CancelablePromise from '@cancjs/promise';

export class DualUseError extends Error {
  readonly code = 'DUAL_USE_CODE';
}

declare function runOperation(): CancelablePromise<string, DualUseError>;

export function syncThrower(): string {
  throw new DualUseError('Plain sync throw');
}

export const op = runOperation();
