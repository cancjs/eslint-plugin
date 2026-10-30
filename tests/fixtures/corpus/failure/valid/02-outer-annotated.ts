import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function fetchUser(): CancelablePromise<{ id: string }>;

export const loadUser: () => CancelablePromise<string, Error> = cancAsync(function* () {
  const user = yield* cancAwait(fetchUser());
  return user.id;
});
