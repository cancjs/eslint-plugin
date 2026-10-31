# canc/no-cancellation-gap

Disallow non-cancelable promises inside cancelable coroutines and promise chains.

A cancellation gap occurs when an operation embedded inside a cancelable coroutine (`cancAwait` operand or bare `yield`) or inside a cancelable promise chain (`.then`, `.catch`, or `.finally` handler) returns a plain `Promise` instead of a `CancelablePromise`.

When the outer coroutine or chain is canceled, cancellation cannot propagate into non-cancelable promises. The coroutine or chain stops waiting and discards the result, but the background work continues running until completion, causing resource leaks and unwanted side effects.

This rule requires TypeScript type checking. Handlers returning a `CancelablePromise` close the gap automatically through cancellation adoption and are not flagged.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

declare function fetchNative(): Promise<User>;

const load = cancAsync(function* () {
  // fetchNative is a plain Promise: cancellation cannot abort it
  const user = yield* cancAwait(fetchNative());
  return user;
});
```

```ts
import CancelablePromise from '@cancjs/promise';

declare function plainLegacyCall(): Promise<Data>;

const task = CancelablePromise.resolve()
  .then(() => plainLegacyCall()); // Plain promise returned inside chain handler
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function fetchCancelable(): CancelablePromise<User>;

const load = cancAsync(function* () {
  const user = yield* cancAwait(fetchCancelable());
  return user;
});
```

```ts
import CancelablePromise from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

const fetchCancelable = cancelify(fetchNative);

const load = cancAsync(function* () {
  const user = yield* cancAwait(fetchCancelable());
  return user;
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
  "canc/no-cancellation-gap": [
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
  "canc/no-cancellation-gap": [
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

This rule is part of the strict tier and requires TypeScript parser services. You may disable this rule or use an eslint-disable comment for:

- Intentional one-off boundary calls to third-party asynchronous libraries where cancellation cannot be adapted and background execution is harmless.
- Deliberately fire-and-forget asynchronous tasks.
- Teaching examples or documentation snippets that illustrate plain promises.
