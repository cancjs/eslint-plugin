# canc/require-signal-forwarding

📝 Require AbortController signals to be forwarded to operations when cancel aborts the controller.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

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

## When not to use it

Turn this rule off when the operation cancels through another channel, such as a client object with its own `cancel` method, and the controller only guards unrelated work. Otherwise forward the signal.
