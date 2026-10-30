# canc/valid-cancasync

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

This rule does not accept any options.

## When not to use it

If your project does not use coroutine drivers from `@cancjs/coroutine` or `@cancjs/coroutine/gen`, you can disable this rule.
