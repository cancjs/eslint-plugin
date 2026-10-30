# canc/prefer-canc-throw

Require `return yield* canc.throw(...)` instead of bare `throw` inside coroutines so TypeScript infers failure types.

In `@cancjs/coroutine`, the return type of a `cancAsync` coroutine is inferred from its yielded steps. A bare `throw` statement inside a coroutine body bypasses the yield-based type collection mechanism, causing TypeScript to infer `CancelablePromise<T, never>` instead of propagating the thrown error type into the failure union.

Using `return yield* canc.throw(err)` (or `cancGen.throw` in `cancGenAsync` generator bodies) introduces a typed failure carrier step into the coroutine. This allows TypeScript to automatically incorporate the error type into the promise's declared failure union.

`CancelError` is never reported by this rule. Rethrowing or throwing `CancelError` signals cooperative cancellation rather than a domain failure, and is therefore always permitted.

## Rule details

### Incorrect

```ts
import { cancAsync } from '@cancjs/coroutine';

export const loadRecord = cancAsync(function* (id: string) {
  if (!id) {
    throw new NotFoundError('Record missing');
  }
  return yield* cancAwait(fetchRecord(id));
});
```

### Correct

```ts
import { cancAsync, cancThrow } from '@cancjs/coroutine';

export const loadRecord = cancAsync(function* (id: string) {
  if (!id) {
    return yield* cancThrow(new NotFoundError('Record missing'));
  }
  return yield* cancAwait(fetchRecord(id));
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';
import { CancelError } from '@cancjs/promise';

export const loadRecord = cancAsync(function* () {
  // CancelError is never reported
  throw new CancelError('Aborted');
});
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/prefer-canc-throw": [
    "warn",
    {
      "requireTypeInfo": false,
      "allowCatchRethrow": true,
      "exclude": []
    }
  ]
}
```

### requireTypeInfo

Default: `false`. When set to `true`, the rule runs only when TypeScript parser services are available and degrades silently when type information is missing.

### allowCatchRethrow

Default: `true`. When enabled, rethrowing the catch clause parameter (for example, `catch (err) { throw err; }`) is permitted without being flagged as an uncaptured failure.

### exclude

Default: `[]`. An array of class matchers specifying error classes that represent programming bugs or assertion errors rather than declared domain failures. Excluded classes are ignored when thrown bare. Matchers are described under Class matchers below.

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
  "canc/prefer-canc-throw": [
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
  "canc/prefer-canc-throw": [
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

If your codebase intentionally uses uncaught exceptions for all failure modes and does not declare typed failure unions on promises, you can disable this rule.
