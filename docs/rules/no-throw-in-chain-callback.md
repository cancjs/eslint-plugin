# canc/no-throw-in-chain-callback

Disallow bare `throw` inside `CancelablePromise` chain callbacks; prefer returning `CancelablePromise.fail(error)`.

In a `CancelablePromise` method chain (`.then(...)`, `.catch(...)`, or `.finally(...)`), throwing an exception synchronously inside a callback causes the runtime to reject the resulting promise. However, TypeScript cannot infer the failure type from a `throw` statement within a callback return signature, causing the chain's failure type to evaluate to `never` or `unknown`.

To preserve typed failure tracking across promise chains, return a failed promise using `CancelablePromise.fail(error)` instead of throwing. Calling `CancelablePromise.fail(...)` populates the failure type parameter `FailureOf` cleanly in the resulting promise type.

Similarly, calling bare `CancelablePromise.reject(error)` without explicit type arguments erases failure typing. Use `CancelablePromise.fail(error)` or specify the failure type explicitly with `CancelablePromise.reject<never, CustomError>(error)`.

`CancelError` is never reported by this rule. Throwing or returning a `CancelError` signals cooperative cancellation rather than a domain error.

## Rule details

### Incorrect

```ts
import type CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string>;

export const chain = p.then((value) => {
  if (!value) {
    // Bare throw bypasses failure typing
    throw new NotFoundError('Item missing');
  }
  return value.toUpperCase();
});
```

```ts
import CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string>;

export const chain = p.then((value) => {
  // Bare reject erases failure type
  return CancelablePromise.reject(new NotFoundError('Item missing'));
});
```

### Correct

```ts
import CancelablePromise from '@cancjs/promise';

declare const p: CancelablePromise<string>;

export const chain = p.then((value) => {
  if (!value) {
    return CancelablePromise.fail(new NotFoundError('Item missing'));
  }
  return value.toUpperCase();
});
```

```ts
import type CancelablePromise from '@cancjs/promise';
import { CancelError } from '@cancjs/promise';

declare const p: CancelablePromise<string>;

export const chain = p.catch((err) => {
  // CancelError is never reported
  throw new CancelError('Aborted');
});
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/no-throw-in-chain-callback": [
    "warn",
    {
      "requireTypeInfo": false,
      "allowThrowInFinally": true,
      "allowRejectionForms": false
    }
  ]
}
```

### requireTypeInfo

Default: `false`. When set to `true`, the rule runs only when TypeScript parser services are available and degrades silently when type information is missing.

### allowThrowInFinally

Default: `true`. When set to `true`, throwing inside a `.finally(...)` callback is permitted without warnings because `finally` callbacks do not affect the failure type of the returned promise.

### allowRejectionForms

Default: `false`. When set to `true`, returning bare `CancelablePromise.reject(...)` without failure type arguments is permitted.

## When not to use it

If your project does not utilize declared failure types on CancelablePromise chains, you can disable this rule.
