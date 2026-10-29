# canc/no-cancellation-gap

Disallow non-cancelable promises inside cancelable coroutines and promise chains.

A cancellation gap occurs when an operation embedded inside a cancelable coroutine (`cancAwait` operand or bare `yield`) or inside a cancelable promise chain (`.then`, `.catch`, or `.finally` handler) returns a plain `Promise` instead of a `CancelablePromise`.

When the outer coroutine or chain is canceled, cancellation cannot propagate into non-cancelable promises. The coroutine or chain stops waiting and discards the result, but the background work continues running until completion, causing resource leaks and unwanted side effects.

This rule requires TypeScript type checking. Handlers returning a `CancelablePromise` close the gap automatically through cancellation adoption and are not flagged.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

declare function fetchNative(): Promise<User>;

const load = cancAsync(function* () {
  // fetchNative is a plain Promise: cancellation cannot abort it
  const user = yield* cancAwait(fetchNative());
  return user;
});
```

```ts
import CancelablePromise from '@cancjs/promise';

declare function plainLegacyCall(): Promise<Data>;

const task = CancelablePromise.resolve()
  .then(() => plainLegacyCall()); // Plain promise returned inside chain handler
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';

declare function fetchCancelable(): CancelablePromise<User>;

const load = cancAsync(function* () {
  const user = yield* cancAwait(fetchCancelable());
  return user;
});
```

```ts
import CancelablePromise from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

const fetchCancelable = cancelify(fetchNative);

const load = cancAsync(function* () {
  const user = yield* cancAwait(fetchCancelable());
  return user;
});
```

## Options

This rule does not accept any options.

## When not to use it

This rule is part of the strict tier and requires TypeScript parser services. You may disable this rule or use an eslint-disable comment for:

- Intentional one-off boundary calls to third-party asynchronous libraries where cancellation cannot be adapted and background execution is harmless.
- Deliberately fire-and-forget asynchronous tasks.
- Teaching examples or documentation snippets that illustrate plain promises.
