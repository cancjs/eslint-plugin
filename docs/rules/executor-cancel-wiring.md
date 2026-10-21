# canc/executor-cancel-wiring

Require cancel wiring in promise executors.

A `CancelablePromise` whose executor neither registers a `handleCancel` callback, nor forwards `getSignal()`, nor receives a `signal` constructor option produces a promise whose cancellation stops downstream chain propagation but leaks the underlying asynchronous work. This rule enforces that cancel wiring is explicitly provided for all operations started in executors.

## Rule details

### Incorrect

```ts
const profile = new CancelablePromise<Profile>((resolve, reject) => {
  fetchProfile(userId, signalCapableButUnused).then(resolve, reject);
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

```ts
// eslint-disable-next-line canc/executor-cancel-wiring
const stats = new CancelablePromise<Stats>((resolve, reject) => {
  computeStatsNonAbortable().then(resolve, reject);
});
```

## Options

This rule has no options.

## When not to use it

Do not enable this rule if you intentionally rely on chain-level-only cancellation where the underlying operation is non-abortable and leaks are acknowledged with disable comments.
