# canc/prefer-signal-accessor

Prefer the `ctx.signal` property accessor over `ctx.getSignal()`.

In `@cancjs/promise`, the promise executor context provides an `AbortSignal` through property access `ctx.signal` (or parameter destructuring `{ signal }`). The legacy method `ctx.getSignal()` is deprecated in favor of this property accessor.

## Migration notice

- Replaced API: `ctx.getSignal()`.
- Replacement API: `ctx.signal` property accessor or `{ signal }` context parameter.
- Minimum library version: Available since `@cancjs/promise` version 1.8.0.
- Compatibility: The legacy `getSignal()` method remains functional and supported until the next major release (version 2.0).

## Rule details

### Incorrect

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource() {
  return new CancelablePromise((resolve, reject, ctx) => {
    // Calling legacy getSignal() method
    const signal = ctx.getSignal();
    doFetch(signal).then(resolve, reject);
  });
}
```

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource() {
  return new CancelablePromise((resolve, reject, { getSignal }) => {
    const signal = getSignal();
    doFetch(signal).then(resolve, reject);
  });
}
```

### Correct

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource() {
  return new CancelablePromise((resolve, reject, { signal }) => {
    // Using modern property destructuring
    doFetch(signal).then(resolve, reject);
  });
}
```

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource() {
  return new CancelablePromise((resolve, reject, ctx) => {
    // Accessing signal property
    doFetch(ctx.signal).then(resolve, reject);
  });
}
```

## Options

This rule does not accept any options.

## When not to use it

If your codebase targets a version of `@cancjs/promise` older than 1.8.0 where the `signal` property accessor is not yet available, you can disable this rule until dependencies are upgraded.
