# canc/prefer-is-cancel-error

📝 Prefer brand-checking functions over instanceof or name checks for cancellation errors.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

🔧💡 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix) and manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

Prefer brand-checking functions over instanceof or name checks for cancellation errors.

Checks such as `err instanceof CancelError` or `err.name === 'CancelError'` fail across package copies and different JavaScript realms. Because brand symbols in `@cancjs` are collision-proof and frozen, helper functions such as `isCancelError` and `isCancPromise` provide dependable identity verification across multiple library instances.

This rule also guards against incorrect AbortError handling: when a cancelable promise constructed with an `AbortSignal` is canceled, it rejects with a `CancelError` whose `cause` is the underlying `DOMException`, not with `DOMException` itself. Checking `err.name === 'AbortError'` directly on the rejection error never matches in a cancelable flow.

## Fixes and Suggestions

- `x instanceof CancelError`: Automated fix (`--fix`) to `isCancelError(x)` when a local `isCancelError` import is available in scope; otherwise reports without suggestion.
- `x instanceof CancelablePromise`: Automated fix (`--fix`) to `isCancPromise(x)` when a local `isCancPromise` import is available in scope; otherwise reports without suggestion.
- `err.name === 'CancelError'` or `switch`: Reports with suggestion to use `isCancelError(err)`.
- `err.name === 'AbortError'` in cancelable catch with `DOMException`: Reports with suggestion to use `isCancelError(err)` for direct pairs.
- Standalone `err.name === 'AbortError'`: Reports with suggestion to use `isAbortError(err)`.

## Rule details

### Incorrect

```ts
try {
  yield* cancAwait(fetchUser());
} catch (err) {
  if (err instanceof CancelError) {
    return;
  }
  throw err;
}
```

```ts
try {
  yield* cancAwait(fetchUser());
} catch (err) {
  if ((err as Error).name === 'CancelError') {
    return;
  }
  throw err;
}
```

```ts
if (value instanceof CancelablePromise) {
  value.cancel();
}
```

```ts
try {
  yield* cancAwait(fetchUser());
} catch (err) {
  if (err instanceof DOMException && (err as any).name === 'AbortError') {
    return;
  }
  throw err;
}
```

### Correct

```ts
try {
  yield* cancAwait(fetchUser());
} catch (err) {
  if (isCancelError(err)) {
    throw err;
  }
  showErrorToast(err);
}
```

```ts
if (isCancPromise(value)) {
  value.cancel();
}
```

```ts
fetchPlain().catch((err) => {
  if (isAbortError(err)) {
    return;
  }
  throw err;
});
```

## When not to use it

If your codebase runs strictly in an isolated single-package environment and does not interact with cancelable promises, or if you write custom platform error wrappers, you can disable this rule.
