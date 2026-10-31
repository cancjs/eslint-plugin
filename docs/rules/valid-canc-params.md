# canc/valid-canc-params

📝 Enforce valid parameter count and shapes for cancelable promise methods.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

<!-- end auto-generated rule header -->

Enforce valid argument count and shapes for cancellable promise methods.

This rule enforces valid argument counts and shapes for static and instance methods of `CancelablePromise` and `LazyPromise`. It validates static methods such as `all`, `race`, `any`, `allSettled`, `resolve`, `reject`, `withResolvers`, and `try`, as well as instance methods such as `then`, `catch`, `finally`, and `handleCancel`.

## Rule details

### Incorrect

```ts
CancelablePromise.all();
```

```ts
CancelablePromise.all(items, opts, 'extra');
```

```ts
CancelablePromise.try();
```

```ts
CancelablePromise.withResolvers({}, 'extra');
```

```ts
cancPromise.then(onFulfilled, onRejected, 'extra');
```

```ts
cancPromise.handleCancel();
```

```ts
CancelablePromise.try({ signal: controller.signal });
```

### Correct

```ts
CancelablePromise.all([Promise.resolve(1)], { signal: controller.signal });
```

```ts
CancelablePromise.try(compute, 1, 2);
```

```ts
CancelablePromise.try({ signal: controller.signal }, worker, 1);
```

```ts
CancelablePromise.resolve();
```

```ts
CancelablePromise.reject(new Error('fail'), {});
```

```ts
cancPromise.finally(cleanup);
```

```ts
cancPromise.handleCancel(onCancel, { immediate: true });
```
