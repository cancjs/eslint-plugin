# canc/no-coroutine-dialect-mismatch

Disallow mixing coroutine helpers between `cancAsync` and `cancGenAsync` dialects.

The `@cancjs` suite provides two coroutine drivers with distinct semantics:

1. `@cancjs/coroutine` (`cancAsync`): Coroutines that resolve to a single value. Internal steps are awaited using `cancAwait`, and async iterables are consumed using `cancForAwait`.
2. `@cancjs/coroutine/gen` (`cancGenAsync`): Generator coroutines that yield values to an async iterator consumer. A bare `yield value` emits a value to the consumer, internal steps are awaited using `cancGenAwait`, sub-iterables are delegated using `cancGenDelegate`, and async iterables are consumed using `cancGenForAwait`.

Crossing helpers across these dialects causes silent bugs:

- Using `cancAwait` in `cancGenAsync` emits the promise object to the iterator consumer rather than awaiting it.
- Using `cancGenAwait` in `cancAsync` passes an internal marker object to the driver, which treats it as a plain resolved value.
- Using `cancForAwait` in `cancGenAsync` yields bare values that the generator driver misinterprets as emits.
- Using `cancGenForAwait` in `cancAsync` produces marker values that the `cancAsync` driver cannot interpret.

## Rule details

### Incorrect

```ts
import { cancGenAsync } from '@cancjs/coroutine/gen';
import { cancAwait } from '@cancjs/coroutine';

const stream = cancGenAsync(function* () {
  // Wrong dialect: cancAwait in cancGenAsync emits the promise instead of awaiting it
  const user = yield* cancAwait(fetchUserCancelable());
  yield user;
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';
import { cancGenAwait } from '@cancjs/coroutine/gen';

const load = cancAsync(function* () {
  // Wrong dialect: cancGenAwait in cancAsync passes marker object to driver
  const user = yield* cancGenAwait(fetchUserCancelable());
  return user;
});
```

### Correct

```ts
import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';

const stream = cancGenAsync(function* () {
  const user = yield* cancGenAwait(fetchUserCancelable());
  yield user;
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const load = cancAsync(function* () {
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

An object entry matches a named import of `name` from `source`, a call `ns.name(...)` through a namespace import (`import * as ns`), and a top-level `require` of `source`, destructured or kept as a namespace object.

Set the same factory options on every coroutine rule, for example from one shared constant in the flat config, so that all rules agree on what a coroutine is.

Use `additionalCoroutineFactories` and `additionalGenCoroutineFactories` to extend: the built-in functions keep working and the listed ones are added. Use `coroutineFactories` and `genCoroutineFactories` to replace: the built-in function of that dialect stops counting. For one dialect, an add option and its replace option cannot be set together. An entry cannot be listed for both dialects. The two dialects differ in how a body is awaited, so list a wrapper under the dialect that matches how it drives its generator.

For a wrapper that runs a `cancAsync` body, extend the first list:

```json
{
  "canc/no-coroutine-dialect-mismatch": [
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
  "canc/no-coroutine-dialect-mismatch": [
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

This rule catches silent semantic errors caused by mixing incompatible dialect helpers. It should always remain enabled when using coroutines.
