import { type AsyncResult, cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function fetchUser(): CancelablePromise<{ id: string }, Error>;

export const loadUser = cancAsync(function* (): AsyncResult<string, Error> {
  const user = yield* cancAwait(fetchUser());
  return user.id;
});
