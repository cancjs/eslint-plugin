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

This rule does not accept any options.

## When not to use it

If your project does not utilize declared failure types on CancelablePromise chains, you can disable this rule.
