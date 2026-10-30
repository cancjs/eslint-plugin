import type CancelablePromise from '@cancjs/promise';

export class AppBaseError extends Error {
  readonly kind = 'AppBaseError';
}

export class UserNotFoundError extends AppBaseError {
  readonly userSubtype = 'UserNotFound';
}

declare function fetchAccount(): CancelablePromise<string, UserNotFoundError>;

export const p = fetchAccount();
