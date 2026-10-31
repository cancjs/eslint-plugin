# canc/valid-cancasync

📝 Ensure coroutines are driven by valid generator functions with proper type annotations.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

<!-- end auto-generated rule header -->

Enforce valid generator function arguments and return types for coroutine drivers.

The `cancAsync` and `cancGenAsync` coroutine drivers require a synchronous generator function (`function*`). Passing an `async` function or an `async` generator (`async function*`) breaks the cancellation driver because cancel propagation relies on synchronous generator stepping and generator unwinding via `.return()`.

With type information, the rule also reports a plain (non-generator) function whose return type is provably not an iterator. A function that returns `any`, `unknown`, `never` or a generic type is not reported, because it may still return a generator object.

In addition, an explicit `: any` return type annotation or a `Generator<..., any, ...>` annotation with `any` in the TNext slot collapses the return type of every `yield*` step to `any`. This single annotation silently untypes the entire coroutine and destroys per-step type inference.

## Rule details

### Incorrect

```ts
import { cancAsync } from '@cancjs/coroutine';

// Async function cannot be driven as a coroutine
const load = cancAsync(async function () {
  return await fetchUserCancelable();
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';

// Async generator cannot be driven as a coroutine
const stream = cancAsync(async function* () {
  yield await fetchUserCancelable();
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';

// With type information: a plain function returning a number has no steps
const load = cancAsync(() => 42);
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

// Explicit any return annotation collapses every yield* step type to any
const load = cancAsync(function* (): any {
  const user = yield* cancAwait(fetchUserCancelable());
  return user;
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  const user = yield* cancAwait(fetchUserCancelable());
  return user;
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type { AsyncResult } from '@cancjs/coroutine';

const load = cancAsync(function* (): AsyncResult<User> {
  const user = yield* cancAwait(fetchUserCancelable());
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

For a configured factory, only the checks on a generator function apply: the `any` return annotation checks. Async functions, async generators and return types that are not iterators are reported for the built-in drivers only.

An object entry matches a named import of `name` from `source`, a call `ns.name(...)` through a namespace import (`import * as ns`), and a top-level `require` of `source`, destructured or kept as a namespace object.

Set the same factory options on every coroutine rule, for example from one shared constant in the flat config, so that all rules agree on what a coroutine is.

Use `additionalCoroutineFactories` and `additionalGenCoroutineFactories` to extend: the built-in functions keep working and the listed ones are added. Use `coroutineFactories` and `genCoroutineFactories` to replace: the built-in function of that dialect stops counting. For one dialect, an add option and its replace option cannot be set together. An entry cannot be listed for both dialects. The two dialects differ in how a body is awaited, so list a wrapper under the dialect that matches how it drives its generator.

For a wrapper that runs a `cancAsync` body, extend the first list:

```json
{
  "canc/valid-cancasync": [
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
  "canc/valid-cancasync": [
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

If your project does not use coroutine drivers from `@cancjs/coroutine` or `@cancjs/coroutine/gen`, you can disable this rule.
