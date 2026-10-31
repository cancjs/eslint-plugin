import type { CancelablePromise } from '@cancjs/promise';

interface Unlisted { readonly _cancUnlisted: true; }
interface BrandedError extends Error { readonly code?: string; }
interface BrandedErrorConstructor<TBrand extends string> {
  new (message?: string): BrandedError & { readonly [K in TBrand as '_cancErrorBrand']: K };
}

declare const QuotaError: BrandedErrorConstructor<'demo:QuotaError'>;
type QuotaError = InstanceType<typeof QuotaError>;

declare function withDeadline(
  ms: number,
): CancelablePromise<number, (BrandedError & { readonly _cancErrorBrand: 'demo:DeadlineError' }) | Unlisted>;

export function check(): CancelablePromise<number, QuotaError | BrandedError | Unlisted> { // lint: no-failure-widening:failureWidening
  return withDeadline(500);
}
