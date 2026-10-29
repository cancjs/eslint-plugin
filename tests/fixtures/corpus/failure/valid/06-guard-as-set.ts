import type CancelablePromise from '@cancjs/promise';

class HttpError extends Error {}
class NotFoundError extends Error {}

declare function createIsError<T extends any[]>(...matchers: T): (e: unknown) => boolean;
declare function withFailure(matcher: any): (p: any) => any;
declare function catchErrors(p: any, matcher: any): any;

type MatchedError<T> = T extends (e: unknown) => e is infer R ? R : never;

const isUserFailure = createIsError(HttpError, NotFoundError);

export function handleUserFailure(p: CancelablePromise<string>) {
  const guarded = withFailure(isUserFailure)(p);
  catchErrors(guarded, isUserFailure);

  try {
    // try block
  } catch (e) {
    if (isUserFailure(e)) {
      const _matched: MatchedError<typeof isUserFailure> = e as any;
      void _matched;
    } else {
      throw e;
    }
  }
}
