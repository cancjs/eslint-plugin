import {
  CancelablePromise,
  isCancelError,
  suppressCancel,
} from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';

export declare const catalogSearch: CancelablePromise<{ id: string }[]>;
export declare const nativeSearch: Promise<{ id: string }[]>;
export declare function render(items: { id: string }[]): void;
export declare function notify(err: unknown): void;

export class CustomWrapError extends Error {
  constructor(public cause: unknown) {
    super('wrapped');
  }
}

export function handleGuard(): void {
  catalogSearch.catch((err: unknown) => {
    if (isCancelError(err)) {
      throw err;
    }
    notify(err);
  });
}

export function handleGuardReturn(): void {
  catalogSearch.catch((err: unknown) => {
    if (isCancelError(err)) {
      return;
    }
    notify(err);
  });
}

export function handleRethrow(): void {
  catalogSearch.catch((err: unknown) => {
    notify(err);
    throw err;
  });
}

export function handleBoundary(): void {
  catalogSearch.catch((err: unknown) => {
    suppressCancel(err);
  });
}

export function handleLogReturn(): void {
  catalogSearch.catch((err: unknown) => {
    console.error(err);
    return;
  });
}

export function handleWrapped(): void {
  catalogSearch.catch((err: unknown) => {
    throw new CustomWrapError(err);
  });
}

export function handleDestructured(): void {
  catalogSearch.catch(({ message }: Error) => {
    notify(message);
  });
}

export const runSearch = cancAsync(function* () {
  try {
    const results = yield* cancAwait(catalogSearch);
    render(results);
  } catch (err) {
    if (isCancelError(err)) {
      throw err;
    }
    notify(err);
  }
});
