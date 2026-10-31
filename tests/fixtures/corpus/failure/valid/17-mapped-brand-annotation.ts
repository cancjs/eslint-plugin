import type { CancelablePromise } from '@cancjs/promise';

interface Unlisted { readonly _cancUnlisted: true; }
interface BrandedError extends Error { readonly code?: string; }
interface BrandedErrorConstructor<TBrand extends string> {
  new (message?: string): BrandedError & { readonly [K in TBrand as '_cancErrorBrand']: K };
}

declare const DeadlineError: BrandedErrorConstructor<'demo:DeadlineError'>;
type DeadlineError = InstanceType<typeof DeadlineError>;

declare function withDeadline(
  ms: number,
): CancelablePromise<number, (BrandedError & { readonly _cancErrorBrand: 'demo:DeadlineError' }) | Unlisted>;

export function check(): CancelablePromise<number, DeadlineError | Unlisted> {
  return withDeadline(500);
}
