# canc/require-signal-forwarding

Require forwarding controller signal when cancel handler aborts it.

When an executor registers a `handleCancel` callback that aborts an `AbortController`, the controller's `signal` must be passed to the underlying operation. If the signal is not forwarded, calling `abort()` when cancelled has no effect on the underlying request or process, and the operation continues running.

## Rule details

### Incorrect

```ts
const profile = new CancelablePromise<Profile>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchProfile(userId).then(resolve, reject);
});
```

### Correct

```ts
const profile = new CancelablePromise<Profile>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchProfile(userId, controller.signal).then(resolve, reject);
});
```

```ts
const profile = new CancelablePromise<Profile>((resolve, reject, { getSignal }) => {
  fetchProfile('/api/user', { signal: getSignal() }).then(resolve, reject);
});
```

## Options

This rule has no options.
