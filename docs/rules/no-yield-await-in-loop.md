# canc/no-yield-await-in-loop

Disallow awaiting cancelable steps sequentially inside iteration loops.

Using `yield* cancAwait(...)` inside `for`, `for-of`, `for-in`, `while`, or `do-while` loops executes each iteration sequentially. When loop iterations are independent and can run concurrently, awaiting each step sequentially serializes operations and increases total execution time.

Independent operations should be initiated concurrently using `cancAwait.all(...)`. Loops where subsequent iterations depend on variables updated or read across iterations (such as accumulator variables or sequential dependencies) are permitted.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (ids: string[]) {
  const results = [];
  for (const id of ids) {
    // Serialized independent steps: should be batched
    const item = yield* cancAwait(fetchItem(id));
    results.push(item);
  }
  return results;
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (ids: string[]) {
  // Concurrent execution using cancAwait.all
  const results = yield* cancAwait(
    CancelablePromise.all(ids.map((id) => fetchItem(id)))
  );
  return results;
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const processChain = cancAsync(function* (initialId: string) {
  let currentId = initialId;
  for (let i = 0; i < 5; i++) {
    // Deliberately sequential: next step depends on previous result
    const nextItem = yield* cancAwait(fetchNext(currentId));
    currentId = nextItem.nextId;
  }
  return currentId;
});
```

## Options

This rule accepts an optional options object with the coroutine factory properties below. None is required.

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
  "canc/no-yield-await-in-loop": [
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
  "canc/no-yield-await-in-loop": [
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

This rule belongs to the strict tier. You may disable this rule or use an eslint-disable comment for:

- Deliberately sequential loops, such as rate-limited API calls, retry backoffs, or ordered database migrations.
- Resource-constrained loops where parallel execution would overwhelm system memory or connection pools.
- Teaching examples illustrating sequential iteration logic.
