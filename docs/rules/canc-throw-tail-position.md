# canc/canc-throw-tail-position

Require `return yield* canc.throw(...)` in tail position so following code is unreachable.

`canc.throw(...)` (along with `cancGen.throw`, `cancThrow`, and `cancGenThrow`) returns a step generator that throws an error when delegated via `yield*`. At runtime, execution halts and the error propagates to the enclosing `try/catch` or rejects the coroutine promise.

However, TypeScript does not treat `yield*` expression statements as terminating constructs. When a function has a declared return type, writing `yield* canc.throw(...)` without a preceding `return` can cause TS2355 ("A function whose declared type is neither 'undefined', 'void', nor 'any' must return a value"). Writing `return yield* canc.throw(...)` signals to TypeScript's control-flow analysis that the current branch terminates because `canc.throw` evaluates to `never`.

## Rule details

### Incorrect

```ts
import { cancAsync, cancThrow } from '@cancjs/coroutine';

export const findUser = cancAsync(function* (id: string): CancelablePromise<User, Error> {
  if (!id) {
    yield* cancThrow(new Error('Missing id'));
  }
  return yield* cancAwait(fetchUser(id));
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';

export const processItem = cancAsync(function* (item: Item) {
  try {
    yield* cancAwait(validate(item));
  } catch (err) {
    yield* canc.throw(err);
  }
});
```

### Correct

```ts
import { cancAsync, cancThrow } from '@cancjs/coroutine';

export const findUser = cancAsync(function* (id: string): CancelablePromise<User, Error> {
  if (!id) {
    return yield* cancThrow(new Error('Missing id'));
  }
  return yield* cancAwait(fetchUser(id));
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';

export const processItem = cancAsync(function* (item: Item) {
  try {
    yield* cancAwait(validate(item));
  } catch (err) {
    return yield* canc.throw(err);
  }
});
```

## Options

This rule does not accept any options.

## When not to use it

If your codebase relies on compiler options that do not enforce reachable return paths, you can disable this rule.
