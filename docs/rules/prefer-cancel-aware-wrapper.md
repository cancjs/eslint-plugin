# canc/prefer-cancel-aware-wrapper

Disallow hand-rolled signal wiring and manual finally abort inside coroutines.

Creating an `AbortController` or `createAbortSignal()` inside a `cancAsync` or `cancGenAsync` coroutine, threading its signal into downstream calls, and calling `.abort()` in a `finally` block re-implements cancel propagation manually.

This pattern duplicates boilerplates, risks leaking event listeners, and introduces error-prone synchronization flags. Instead, wrap the underlying asynchronous function with a reusable cancel-aware utility such as `cancelify` (for promise-returning functions) or `promisify` (for callback-based functions) from `@cancjs/toolbox`.

When wrapped with `cancelify`, canceling the coroutine automatically aborts the forwarded signal without manual `finally` blocks or local controller management.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

declare function rawFetch(url: string, signal: AbortSignal): Promise<Response>;

const load = cancAsync(function* (url: string) {
  const controller = new AbortController();
  try {
    // Hand-rolled signal forwarding with manual finally abort
    return yield* cancAwait(rawFetch(url, controller.signal));
  } finally {
    controller.abort();
  }
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';

declare function rawFetch(url: string, signal: AbortSignal): Promise<Response>;

// Reusable cancel-aware wrapper
const fetchCancelable = cancelify((ctx, url: string) => rawFetch(url, ctx.signal));

const load = cancAsync(function* (url: string) {
  return yield* cancAwait(fetchCancelable(url));
});
```

## Options

This rule does not accept any options.

## When not to use it

This rule belongs to the strict tier. You may disable this rule or use an eslint-disable comment for:

- One-off call sites where defining a reusable wrapper adds excessive overhead for a single isolated operation.
- Teaching examples or documentation snippets demonstrating low-level cancellation mechanics.
- Complex third-party APIs whose lifecycle cannot be adapted cleanly by standard wrapper utilities.
