import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

type AsyncResult<T, F = unknown> = CancelablePromise<T, F>;
declare function fetchUser(): CancelablePromise<{ id: string }>;

export const loadUser = cancAsync(function* (): AsyncResult<string, Error> {
  const user = yield* cancAwait(fetchUser());
  return user.id;
});
