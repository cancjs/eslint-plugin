# canc/handle-cancel-first

📝 Require cancel handlers to be registered synchronously at the top of the executor.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

<!-- end auto-generated rule header -->

Ensure cancel handlers are registered synchronously at the start of executors.

The `handleCancel` registration connects the cancel trigger to the underlying resource teardown. Registering `handleCancel` late (such as inside a `.then` continuation callback or timer) creates an asynchronous gap during which a cancellation request is missed, leaving the underlying operation running. Register `handleCancel` synchronously at the top of the executor.

## Rule details

### Incorrect

```ts
const download = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  openStream().then((stream) => {
    handleCancel(() => stream.destroy());
    readAll(stream).then(resolve, reject);
  }, reject);
});
```

```ts
const download = new CancelablePromise<Report>((resolve, reject, ctx) => {
  openStream().then((stream) => {
    ctx.handleCancel(() => stream.destroy());
    readAll(stream).then(resolve, reject);
  }, reject);
});
```

### Correct

```ts
const download = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  openStream(controller.signal)
    .then((stream) => readAll(stream, controller.signal))
    .then(resolve, reject);
});
```

```ts
const cancPromise = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchReport(controller.signal).then(resolve, reject);
});
```

## When not to use it

Turn this rule off in executors that deliberately start the operation first and register cleanup right after, in the same synchronous block, when a reviewer has confirmed that nothing can cancel the promise in between. In that case the gap the rule guards against does not exist.
