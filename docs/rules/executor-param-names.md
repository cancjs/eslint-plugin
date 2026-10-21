# canc/executor-param-names

Enforce standardized parameter names in promise executors.

Standardized parameter names in promise executors improve readability and consistency across a codebase. The first executor parameter must match the expected name for `resolve`, the second parameter must match `reject`, and an optional third parameter must be a destructuring pattern or an identifier matching `context` (or legacy `handleCancel`).

## Rule details

### Incorrect

```ts
const cancPromise = new CancelablePromise<void>((res, rej) => {
  res();
});
```

```ts
const cancPromise = new CancelablePromise<void>((resolve, reject, c) => {
  resolve();
});
```

### Correct

```ts
const cancPromise = new CancelablePromise<void>((resolve, reject, { handleCancel, getSignal }) => {
  resolve();
});
```

```ts
const cancPromise = new CancelablePromise<void>((resolve, reject, ctx) => {
  resolve();
});
```

```ts
const cancPromise = new CancelablePromise<void>((_resolve, _reject) => {
});
```

## Options

This rule accepts a single options object with the following properties:

- `resolve` (string, default `'^_?resolve$'`): regular expression pattern matching valid resolve parameter names.
- `reject` (string, default `'^_?reject$'`): regular expression pattern matching valid reject parameter names.
- `context` (string, default `'^_?(ctx|context)$'`): regular expression pattern matching valid context parameter names.
- `handleCancel` (string, default `'^_?(handleCancel|hc)$'`): regular expression pattern matching valid legacy handleCancel parameter names.
