# canc/no-unstarred-cancawait

Require `yield*` delegation on `cancAwait` and `cancGenAwait` calls inside coroutines.

The `cancAwait` and `cancGenAwait` helpers return a one-shot generator object. Calling `yield cancAwait(...)` without an asterisk delegates the generator object itself to the coroutine driver rather than unwinding the generator. The driver treats the generator object as an already-resolved plain object, resuming immediately with the generator instance while leaving the underlying promise unawaited and cancellation unwired.

Similarly, an unconsumed statement-position `cancAwait(...)` or `cancGenAwait(...)` expression creates a generator object that is immediately discarded without running.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  // Missing asterisk: yields the generator object instead of delegating
  const user = yield cancAwait(fetchUserCancelable());
  return user;
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  // Unconsumed cancAwait call never executes
  cancAwait(fetchUserCancelable());
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
import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';

const stream = cancGenAsync(function* () {
  const item = yield* cancGenAwait(fetchNextItem());
  yield item;
});
```

## Options

This rule does not accept any options.

## When not to use it

This rule catches definite runtime defects where promises are never awaited. It should remain enabled in all codebases using `@cancjs/coroutine` or `@cancjs/coroutine/gen`.
