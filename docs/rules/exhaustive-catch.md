# canc/exhaustive-catch

📝 Require coroutine catch blocks to handle or rethrow all declared failure types.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

Require coroutine catch blocks to handle or rethrow all declared failure types.

When a coroutine executes `yield* cancAwait(...)` steps inside a `try` block, each step declares the specific failure types it may throw. If the enclosing `catch` block catches errors, it must handle every declared failure type or provide a fallback rethrow for unhandled types. Silently dropping declared failures leads to unexpected silent swallows of domain errors.

A failure set is open when it includes a member that declares `_cancUnlisted: true`, wherever that member is declared. The name of the type does not matter. A promise-like branch in the failure union also claims an open failure set. For an open failure set, a catch block must provide an unconditional fallback rethrow unless configured otherwise, since unlisted error types may still arrive at runtime.

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

An exhaustive `switch` on a discriminant of the caught error without `default: throw e` is still reported. Add the default so errors outside the listed cases are rethrown.

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

### `allowRethrow`

Default: `true`. When set to `true`, an unconditional rethrow of the caught binding (such as `throw err;` or `return yield* canc.throw(err);`) satisfies handling for all remaining declared failure types.

### `requireUnlistedFallback`

Default: `true`. When set to `true`, a catch block guarding a step with an open failure set must include an unconditional fallback rethrow for errors not covered by the listed guards.

### exclude

Default: `[]`. An array of class matchers specifying failure classes that do not require exhaustive handling in catch blocks. Matchers are described under Class matchers below.

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
  "canc/exhaustive-catch": [
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
  "canc/exhaustive-catch": [
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
