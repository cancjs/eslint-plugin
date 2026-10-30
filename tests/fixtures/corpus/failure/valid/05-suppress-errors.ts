import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function fetchProfile(): CancelablePromise<string>;
declare function suppressErrors(error: unknown, ...classes: any[]): void;
class IgnoredError extends Error {}

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(fetchProfile());
  } catch (e) {
    suppressErrors(e, IgnoredError);
  }
});
