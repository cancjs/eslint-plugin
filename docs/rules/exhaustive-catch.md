# canc/exhaustive-catch

Require coroutine catch blocks to handle or rethrow all declared failure types.

When a coroutine executes `yield* cancAwait(...)` steps inside a `try` block, each step declares the specific failure types it may throw. If the enclosing `catch` block catches errors, it must handle every declared failure type or provide a fallback rethrow for unhandled types. Silently dropping declared failures leads to unexpected silent swallows of domain errors.

For open failure sets (types that include the `Unlisted` marker), a catch block must provide an unconditional fallback rethrow unless configured otherwise, since unlisted error types may still arrive at runtime.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    // Neither ErrorA nor ErrorB is handled or rethrown
    console.error(e);
  }
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    // ErrorA is handled, but ErrorB is silently dropped without rethrow
    if (e instanceof ErrorA) {
      console.log('Handled A');
    }
  }
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (e instanceof ErrorA) {
      console.log('Handled A');
    } else if (e instanceof ErrorB) {
      console.log('Handled B');
    }
  }
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (e instanceof ErrorA) {
      console.log('Handled A');
    } else {
      throw e;
    }
  }
});
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/exhaustive-catch": [
    "warn",
    {
      "allowRethrow": true,
      "requireUnlistedFallback": true,
      "exclude": []
    }
  ]
}
```

### allowRethrow

Default: `true`. When set to `true`, an unconditional rethrow of the caught binding (such as `throw err;` or `return yield* canc.throw(err);`) satisfies handling for all remaining declared failure types.

### requireUnlistedFallback

Default: `true`. When set to `true`, a catch block guarding a step with an open failure set must include an unconditional fallback rethrow for errors not covered by the listed guards.

### exclude

Default: `[]`. An array of class matchers specifying failure classes that do not require exhaustive handling in catch blocks.

## When not to use it

If your application architecture routinely handles failures at higher boundaries and uses generic catch blocks solely for local side-effects, you can disable this rule.
