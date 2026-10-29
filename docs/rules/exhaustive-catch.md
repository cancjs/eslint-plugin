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

Default: `[]`. An array of class matchers specifying failure classes that do not require exhaustive handling in catch blocks. Matchers are described under Class matchers below.

## Class matchers

The `exclude` option takes a list of class matchers. A matcher is one of the following.

- A string. A bare name such as `LegacyError` matches that class name exactly. A string wrapped in slashes, such as `/^Internal/`, is a regular expression tested against the class name. The `g` and `y` flags are rejected.
- An object with `from` set to `"file"`, a `name`, and an optional `path`. It matches a class declared in the file at `path`, or in any project file when `path` is omitted.
- An object with `from` set to `"lib"` and a `name`. It matches a class declared by the TypeScript standard library.
- An object with `from` set to `"package"`, a `name`, and a `package`. It matches a class exported by that package.
- An object with `extends`, such as `{ "extends": "BaseError" }` or `{ "extends": "/Error$/" }`. It matches any class that has the named class as an ancestor, directly or through other classes.

In the three `from` forms, `name` is a single string or an array of strings. Object matchers are resolved through type information and are skipped when it is unavailable.

```json
{
  "exclude": [
    "LegacyError",
    "/^Internal/",
    { "from": "package", "name": "HttpError", "package": "http-errors" },
    { "extends": "AssertionError" }
  ]
}
```

## When not to use it

If your application architecture routinely handles failures at higher boundaries and uses generic catch blocks solely for local side-effects, you can disable this rule.
