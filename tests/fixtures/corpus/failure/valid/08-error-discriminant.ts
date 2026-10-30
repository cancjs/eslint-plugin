export class DiscriminatedFieldError extends Error {
  readonly kind = 'Field' as const;
}

export class LiteralNameError extends Error {
  override readonly name = 'LiteralNameError' as const;
}

const BRAND = Symbol.for('@cancjs/app:BrandedSymbolError');

export class BrandedSymbolError extends Error {
  readonly [BRAND] = true;
}

export class UnusedEmptyError extends Error {}

