# canc/prefer-canceled-property

Prefer the `canceled` property over deprecated `isCanceled` on cancelable promises.

In `@cancjs/promise`, `CancelablePromise` instances expose a boolean property `canceled` indicating whether the promise has been canceled. The older property name `isCanceled` is deprecated to standardize naming across the ecosystem.

This rule uses TypeScript type checking to identify `isCanceled` property accesses on cancelable promise types.

## Migration notice

- Replaced API: `promise.isCanceled`.
- Replacement API: `promise.canceled`.
- Minimum library version: Available since `@cancjs/promise` version 1.8.0.
- Compatibility: The legacy `isCanceled` property remains functional and supported until the next major release (version 2.0).

## Rule details

### Incorrect

```ts
import type CancelablePromise from '@cancjs/promise';

function checkStatus(task: CancelablePromise<void>) {
  // Accessing legacy isCanceled property
  if (task.isCanceled) {
    console.log('Task was canceled');
  }
}
```

### Correct

```ts
import type CancelablePromise from '@cancjs/promise';

function checkStatus(task: CancelablePromise<void>) {
  // Using modern canceled property
  if (task.canceled) {
    console.log('Task was canceled');
  }
}
```

## Options

This rule does not accept any options.

## When not to use it

If your project depends on versions of `@cancjs/promise` prior to 1.8.0 that lack the `canceled` property, you can disable this rule until the package is updated.
