// Library base error class: never used in CancelablePromise<T, F>
// require-error-discriminant must not flag it because it is not used in any failure set
export class UnusedLibraryBaseError extends Error {}

export function throwLibraryError(): never {
  throw new UnusedLibraryBaseError('Direct throw outside failure types');
}
