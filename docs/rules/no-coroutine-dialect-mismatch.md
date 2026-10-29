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

This rule does not accept any options.

## When not to use it

This rule catches silent semantic errors caused by mixing incompatible dialect helpers. It should always remain enabled when using coroutines.
