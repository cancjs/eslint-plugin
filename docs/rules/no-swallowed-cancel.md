# canc/no-swallowed-cancel

📝 Disallow catch handlers on cancelable flows that swallow the cancellation.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Ensure cancellation errors are not swallowed or mishandled in catch blocks.

In `@cancjs`, coroutine cancellation normally unwinds generators via `return()`, executing `finally` blocks rather than body `catch` handlers. However, when an inner cancelable sub-operation rejects with `CancelError`, an enclosing `catch` handler receives that error. Treating a cancellation like an ordinary error causes canceled operations to trigger unexpected error notifications, retry loops, or false failure alerts.

Catch blocks in cancelable flows must check `isCancelError(err)` and rethrow the error. Returning from an `isCancelError` check without rethrowing still swallows the cancellation. Alternatively, cancellation should be absorbed using boundary helpers like `catchCancel`, `suppressCancel`, or `suppressErrors`.

Custom boundary functions can be configured in ESLint settings via `settings.canc.boundaryFunctions`.

Without type information the rule checks only chains that start at a canc constructor or static call, and `try` blocks that hold a `cancAwait` call or one of those calls. A `catch` on a variable that holds a cancelable promise, or a `try` around `await` of one, is checked only when type information is available.

## Rule details

### Incorrect

```ts
try {
  const user = yield* cancAwait(fetchUser());
} catch (err) {
  showErrorToast(err);
}
```

```ts
catalogSearch.catch((err) => {
  renderFallback();
});
```

```ts
try {
  yield* cancAwait(syncData());
} catch (err) {
  if (isCancelError(err)) {
    return;
  }
  showErrorToast(err);
}
```

```ts
try {
  yield* cancAwait(fetchDetails());
} catch (err) {
  throw new RequestError(err);
}
```

```ts
try {
  yield* cancAwait(loadProfile());
} catch ({ message }) {
  console.error(message);
}
```

### Correct

```ts
try {
  const user = yield* cancAwait(fetchUser());
} catch (err) {
  if (isCancelError(err)) {
    throw err;
  }
  showErrorToast(err);
}
```

```ts
const user = await catchCancel(fetchUser());
```

```ts
catalogSearch.catch((err) => {
  if (isCancelError(err)) {
    throw err;
  }
  renderFallback();
});
```

In a rejection callback or in any `catch` clause (sync, async, or generator), returning `Promise.reject(err)` (or `CancelablePromise.reject(err)`) on the cancel branch rethrows the same error just like `throw err`, and so does the cancel arm of a returned conditional expression:

```ts
catalogSearch.catch((err) => (isCancelError(err) ? Promise.reject(err) : renderFallback()));
```

Rejecting with a new error, or rejecting with `err` only on the non-cancel branch, still swallows the cancellation.

With `handleErrorBoundary` listed in `settings.canc.boundaryFunctions`:

```ts
try {
  yield* cancAwait(syncData());
} catch (err) {
  handleErrorBoundary(err);
}
```

## Options

This rule accepts an options object with the following properties:

- `allowLogAndReturn` (default: `false`): When set to `true`, handlers that only contain logging calls (such as `console.log` or `logger.warn`) followed by an optional return are permitted.
- `allowEmptyCatch` (default: `false`): When set to `true`, empty `catch` blocks and empty rejection handlers are ignored, with or without a parameter.

```json
{
  "rules": {
    "canc/no-swallowed-cancel": [
      "error",
      {
        "allowLogAndReturn": false,
        "allowEmptyCatch": false
      }
    ]
  }
}
```

## When not to use it

If your architecture explicitly absorbs cancellation inside catch handlers and you rely on other mechanisms for cancellation lifecycle management, you can disable this rule.
