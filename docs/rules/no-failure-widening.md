# canc/no-failure-widening

📝 Disallow casts and type annotations that drop declared failure types.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

Disallow casts and type annotations that silently drop declared failure types from a CancelablePromise.

Declared failures on `CancelablePromise<T, F>` represent domain-level error contracts. Using a type assertion (`as CancelablePromise<T>`) or an annotated assignment that drops failure members bypasses the compiler's failure tracking without runtime handling, resulting in unexpected unhandled rejections downstream.

To refine, narrow, or deliberately erase failure types, use the sanctioned `withFailure` helper from `@cancjs/promise`. Alternatively, an explicit line comment marker (default: `canc-allow-widening`) can acknowledge intentional erasures.

## Sanctioned withFailure forms

The `withFailure` helper provides explicit and documented failure type transitions:

1. `withFailure<TargetError>()(p)`: Restricts or resets the failure type to a specific target error class.
2. `withFailure<ErrorA, ErrorB>()(p)`: Re-declares a multi-member failure union.
3. `withFailure(ErrorA, ErrorB)(p)`: Passes constructor matchers that establish the declared failure set.
4. `withFailure(isCustomError)(p)`: Uses the guard-as-set pattern where a type predicate established by `createIsError` governs the declared failures.

## Rule details

### Incorrect

```ts
import type CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string, NotFoundError>;

// Unchecked cast erases NotFoundError from the failure type
export const result = p as unknown as CancelablePromise<string>;
```

```ts
import type CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string, NotFoundError | ValidationError>;

// Return annotation silently drops ValidationError
export function fetchItem(): CancelablePromise<string, NotFoundError> {
  return p;
}
```

### Correct

```ts
import type CancelablePromise from '@cancjs/promise';
import { withFailure } from '@cancjs/promise';

declare const p: CancelablePromise<string, NotFoundError>;

// Sanctioned withFailure curry explicitly declares the narrowed failure type
export const result = withFailure<NotFoundError>()(p);
```

```ts
import type CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string, NotFoundError>;

// Intentional widening acknowledged by an adjacent line comment
// canc-allow-widening
export const result = p as unknown as CancelablePromise<string>;
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/no-failure-widening": [
    "warn",
    {
      "allowWithComment": "canc-allow-widening",
      "allowVariableAnnotationWidening": true
    }
  ]
}
```

### `allowWithComment`

Default: `"canc-allow-widening"`. A comment string that acknowledges an intentional widening. When placed on the line immediately preceding the cast or annotation, the rule suppresses the warning.

### `allowVariableAnnotationWidening`

Default: `true`. When set to `true`, variable type annotations that omit failure types (for example, `const x: CancelablePromise<string> = p;`) are allowed without warnings. Setting this option to `false` requires all variable annotations to preserve declared failure types.

## When not to use it

If your project does not use declared failure types on CancelablePromise and uses default Promise interfaces everywhere, you can disable this rule.
