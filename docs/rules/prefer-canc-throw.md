# canc/prefer-canc-throw

Require `return yield* canc.throw(...)` instead of bare `throw` inside coroutines so TypeScript infers failure types.

In `@cancjs/coroutine`, the return type of a `cancAsync` coroutine is inferred from its yielded steps. A bare `throw` statement inside a coroutine body bypasses the yield-based type collection mechanism, causing TypeScript to infer `CancelablePromise<T, never>` instead of propagating the thrown error type into the failure union.

Using `return yield* canc.throw(err)` (or `cancGen.throw` in `cancGenAsync` generator bodies) introduces a typed failure carrier step into the coroutine. This allows TypeScript to automatically incorporate the error type into the promise's declared failure union.

`CancelError` is never reported by this rule. Rethrowing or throwing `CancelError` signals cooperative cancellation rather than a domain failure, and is therefore always permitted.

## Rule details

### Incorrect

```ts
import { cancAsync } from '@cancjs/coroutine';

export const loadRecord = cancAsync(function* (id: string) {
  if (!id) {
    throw new NotFoundError('Record missing');
  }
  return yield* cancAwait(fetchRecord(id));
});
```

### Correct

```ts
import { cancAsync, cancThrow } from '@cancjs/coroutine';

export const loadRecord = cancAsync(function* (id: string) {
  if (!id) {
    return yield* cancThrow(new NotFoundError('Record missing'));
  }
  return yield* cancAwait(fetchRecord(id));
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';
import { CancelError } from '@cancjs/promise';

export const loadRecord = cancAsync(function* () {
  // CancelError is never reported
  throw new CancelError('Aborted');
});
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/prefer-canc-throw": [
    "warn",
    {
      "requireTypeInfo": false,
      "allowCatchRethrow": true,
      "exclude": []
    }
  ]
}
```

### requireTypeInfo

Default: `false`. When set to `true`, the rule runs only when TypeScript parser services are available and degrades silently when type information is missing.

### allowCatchRethrow

Default: `true`. When enabled, rethrowing the catch clause parameter (for example, `catch (err) { throw err; }`) is permitted without being flagged as an uncaptured failure.

### exclude

Default: `[]`. An array of class matchers specifying error classes that represent programming bugs or assertion errors rather than declared domain failures. Excluded classes are ignored when thrown bare. Matchers can be string class names, regular expressions, or structured matcher objects.

## When not to use it

If your codebase intentionally uses uncaught exceptions for all failure modes and does not declare typed failure unions on promises, you can disable this rule.
