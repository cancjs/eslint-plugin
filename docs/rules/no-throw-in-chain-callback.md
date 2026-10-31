# canc/no-throw-in-chain-callback

📝 Require returning CancelablePromise.fail() instead of throwing inside chain callbacks on cancelable promises.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

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

This rule accepts an optional options object with the coroutine factory properties below. None is required.

### additionalCoroutineFactories

Default: not set. Extra functions that run their first argument as a `cancAsync` coroutine. This option extends the built-in `cancAsync` recognition.

### additionalGenCoroutineFactories

Default: not set. Extra functions that run their first argument as a `cancGenAsync` coroutine. This option extends the built-in `cancGenAsync` recognition.

### coroutineFactories

Default: not set. Functions that replace the built-in `cancAsync` recognition. When this option is set, `cancAsync` itself no longer counts and only the listed functions do. An empty list turns the built-in off and recognizes nothing.

### genCoroutineFactories

Default: not set. Functions that replace the built-in `cancGenAsync` recognition. When this option is set, `cancGenAsync` itself no longer counts and only the listed functions do. An empty list turns the built-in off and recognizes nothing.

Each list holds entries of two shapes. A string matches a call by callee name: an identifier call such as `useCancelableEffect(...)`, or a member call such as `hooks.useCancelableEffect(...)` on any object. An object with a `name` and a `source` matches only the binding that the file imports as `name` from exactly `source`, under any local alias, through ESM or `require`. A local binding that shadows the import does not match.

A factory counts when its first argument is a generator function, written inline or referenced by a name bound to a plain generator function. An async function or an arrow function is not treated as a coroutine body.

An object entry matches a named import of `name` from `source`, a call `ns.name(...)` through a namespace import (`import * as ns`), and a top-level `require` of `source`, destructured or kept as a namespace object.

Set the same factory options on every coroutine rule, for example from one shared constant in the flat config, so that all rules agree on what a coroutine is.

Use `additionalCoroutineFactories` and `additionalGenCoroutineFactories` to extend: the built-in functions keep working and the listed ones are added. Use `coroutineFactories` and `genCoroutineFactories` to replace: the built-in function of that dialect stops counting. For one dialect, an add option and its replace option cannot be set together. An entry cannot be listed for both dialects. The two dialects differ in how a body is awaited, so list a wrapper under the dialect that matches how it drives its generator.

For a wrapper that runs a `cancAsync` body, extend the first list:

```json
{
  "canc/no-throw-in-chain-callback": [
    "error",
    { "additionalCoroutineFactories": ["useCancelableEffect"] }
  ]
}
```

```ts
import { cancAwait } from '@cancjs/coroutine';

import { useCancelableEffect } from './lib/use-cancelable-effect';

declare function loadUser(): Promise<string>;
declare function render(name: string): void;

useCancelableEffect(function* () {
  const name = yield* cancAwait(loadUser());
  render(name);
}, []);
```

For a wrapper that runs a `cancGenAsync` body, extend the second list. Match by import when the name alone is ambiguous:

```json
{
  "canc/no-throw-in-chain-callback": [
    "error",
    { "additionalGenCoroutineFactories": [{ "name": "streamRows", "source": "./lib/stream-rows" }] }
  ]
}
```

```ts
import { cancGenAwait } from '@cancjs/coroutine/gen';

import { streamRows } from './lib/stream-rows';

declare function fetchPage(): Promise<string[]>;

export const rows = streamRows(function* () {
  const page = yield* cancGenAwait(fetchPage());
  for (const row of page) {
    yield row;
  }
});
```

The replace options are meant for a codebase that never calls the built-in functions directly. If any file still calls `cancAsync` or `cancGenAsync`, prefer the add options: replacing makes those calls look like ordinary functions to this rule. Replace options also mean every wrapper must be listed, because nothing is recognized by default.

## When not to use it

If your project does not utilize declared failure types on CancelablePromise chains, you can disable this rule.
