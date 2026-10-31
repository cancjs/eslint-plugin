# canc/no-executor-return

📝 Disallow returning values from CancelablePromise or LazyPromise executors.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

<!-- end auto-generated rule header -->

Disallow returning values from promise executors.

An executor communicates its outcome exclusively through its `resolve` and `reject` callbacks (and registers cancellation cleanup through `handleCancel`). Returning a value from an executor is ignored by `CancelablePromise`. In `CancelablePromise`, returning a function is also disallowed because `CancelablePromise` does not execute returned functions on cancellation; cleanup must instead be registered with `handleCancel`. In contrast, `LazyPromise` executors have an explicit asymmetry where returning a teardown function is supported, while returning non-function values remains disallowed.

## Rule details

### Incorrect

```ts
const cancPromise = new CancelablePromise<string>((resolve, reject) => {
  return fetchData().then(resolve, reject);
});
```

```ts
const cancPromise = new CancelablePromise<number>((resolve, reject) => resolve(1));
```

```ts
const cancPromise = new CancelablePromise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, 1000);
  return () => clearTimeout(timer);
});
```

### Correct

```ts
const cancPromise = new CancelablePromise<string>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchData(controller.signal).then(resolve, reject);
});
```

```ts
const cancPromise = new CancelablePromise<void>((resolve, reject) => {
  if (shouldSkip) {
    resolve();
    return;
  }
  resolve();
});
```

```ts
const lazy = new LazyPromise<void>((resolve) => {
  const timer = setTimeout(resolve, 100);
  return () => clearTimeout(timer);
});
```

## When not to use it

Turn this rule off only for code that targets a promise class other than `CancelablePromise` or `LazyPromise`, where returning a cleanup function from the executor is part of that class's contract.

## Options

This rule accepts a single options object with the following property:

- `allowVoid` (boolean, default `false`): when set to `true`, expressions returning `void` (such as `return void fn()` or arrow shorthand `() => void resolve()`) are permitted.
