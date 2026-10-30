# canc/prefer-cancawait

Require `yield* cancAwait(...)` instead of bare `yield` in `cancAsync` coroutines.

Inside a `cancAsync` coroutine body, yielding a promise directly via a bare `yield expr` works at runtime, but it destroys TypeScript per-step type inference. In TypeScript, generator functions evaluate any plain `yield` expression to the generator-wide `TNext` parameter, which typically defaults to `unknown`.

The `cancAwait(promise)` helper returns a one-shot generator whose `TReturn` parameter is typed as `Awaited<T>`. When evaluated using generator delegation via `yield* cancAwait(promise)`, TypeScript resolves the expression to the generator's return type. This yield-vs-yield-star typing mechanism gives each step a precise, strongly-typed result without collapsing types to `unknown` or dropping declared failure types.

Delegating to sub-generators using `yield* subGenerator()` and bare checkpoints (`yield;`) with no operand are permitted.

## Rule details

### Incorrect

```ts
import { cancAsync } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  // Bare yield collapses user type to unknown
  const user = yield fetchUserCancelable();
  return user;
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  // yield* cancAwait preserves the inferred User type
  const user = yield* cancAwait(fetchUserCancelable());
  return user;
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';

function* fetchSubSteps() {
  // Generator delegation is allowed
  yield* otherStep();
}

const load = cancAsync(function* () {
  yield* fetchSubSteps();
});
```

## Options

This rule accepts an optional options object. The property `allowBareYield` is specific to this rule. The other four are the coroutine factory options.

### allowBareYield

Default: `false`. When set to `true`, bare `yield <expr>` expressions are permitted in `cancAsync` bodies without reporting.

```json
{
  "canc/prefer-cancawait": ["warn", { "allowBareYield": false }]
}
```

### additionalCoroutineFactories

Default: `[]`. Extra functions that run their first argument as a `cancAsync` coroutine. This option extends the built-in `cancAsync` recognition.

### additionalGenCoroutineFactories

Default: `[]`. Extra functions that run their first argument as a `cancGenAsync` coroutine. This option extends the built-in `cancGenAsync` recognition.

### coroutineFactories

Default: `[]`. Functions that replace the built-in `cancAsync` recognition. When this option is set, `cancAsync` itself no longer counts and only the listed functions do.

### genCoroutineFactories

Default: `[]`. Functions that replace the built-in `cancGenAsync` recognition. When this option is set, `cancGenAsync` itself no longer counts and only the listed functions do.

Each list holds entries of two shapes. A string matches a call by callee name: an identifier call such as `useCancelableEffect(...)`, or a member call such as `hooks.useCancelableEffect(...)` on any object. An object with a `name` and a `source` matches only the binding that the file imports as `name` from exactly `source`, under any local alias, through ESM or `require`. A local binding that shadows the import does not match.

A factory only counts when its first argument is a plain generator function. An async function, an arrow function, or a variable passed in place of the generator is not treated as a coroutine body.

Use `additionalCoroutineFactories` and `additionalGenCoroutineFactories` to extend: the built-in functions keep working and the listed ones are added. Use `coroutineFactories` and `genCoroutineFactories` to replace: the built-in function of that dialect stops counting. For one dialect, an add option and its replace option cannot be set together. An entry cannot be listed for both dialects. The two dialects differ in how a body is awaited, so list a wrapper under the dialect that matches how it drives its generator.

For a wrapper that runs a `cancAsync` body, extend the first list:

```json
{
  "canc/prefer-cancawait": [
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
  "canc/prefer-cancawait": [
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

If your codebase relies on untyped generator steps or opts out of per-step type inference, you can set `allowBareYield: true` or disable this rule.
