export class DiscriminatedFieldError extends Error {
  readonly kind = 'Field' as const;
}

export class LiteralNameError extends Error {
  override readonly name = 'LiteralNameError' as const;
}

export class BrandedSymbolError extends Error {
  readonly [Symbol.for('@cancjs/app:BrandedSymbolError')] = true;
}
