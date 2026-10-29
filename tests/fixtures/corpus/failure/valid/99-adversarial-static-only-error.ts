// Error class with only a static member, never used as a declared failure type
export class StaticOnlyError extends Error {
  static readonly DEFAULT_CODE = 'STATIC_ERR';
}

export function reportStatic(): string {
  return StaticOnlyError.DEFAULT_CODE;
}
