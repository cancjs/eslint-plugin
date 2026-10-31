# canc/prefer-signal-accessor

📝 Prefer 'signal' accessor over deprecated 'getSignal()' on executor context.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

🔧💡 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix) and manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Prefer the `ctx.signal` property accessor over `ctx.getSignal()`.

In `@cancjs/promise`, the promise executor context provides an `AbortSignal` through property access `ctx.signal` (or parameter destructuring `{ signal }`). The legacy method `ctx.getSignal()` is deprecated in favor of this property accessor.

## Migration notice

- Replaced API: `ctx.getSignal()`.
- Replacement API: `ctx.signal` property accessor or `{ signal }` context parameter.
- Minimum library version: Available since `@cancjs/promise` version 1.1.0.
- Compatibility: The legacy `getSignal()` method still works and is marked deprecated.

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

## When not to use it

If your codebase targets a version of `@cancjs/promise` older than 1.1.0 where the `signal` property accessor is not yet available, you can disable this rule until dependencies are upgraded.
