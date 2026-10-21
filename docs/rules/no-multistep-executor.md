# canc/no-multistep-executor

Disallow starting multiple async operations in one executor.

An executor should act as an adapter for exactly one underlying operation. Starting multiple operations sequentially or in parallel inside a single executor collapses cancellation granularity. A single cancel handler cannot determine which step is currently executing, and steps running between operations continue to execute after cancellation. Multi-step workflows should be broken into individual cancelable promises and composed using promise chains or coroutines.

## Rule details

### Incorrect

```ts
const checkout = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  reserveStock(controller.signal)
    .then(() => chargeCard(controller.signal))
    .then(() => resolve(), reject);
});
```

```ts
const checkout = new CancelablePromise<void>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  (async () => {
    await stepOne(controller.signal);
    await stepTwo(controller.signal);
    resolve();
  })().catch(reject);
});
```

### Correct

```ts
function reserveStockCancelable(): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const controller = new AbortController();
    handleCancel(() => controller.abort());
    reserveStock(controller.signal).then(resolve, reject);
  });
}

function chargeCardCancelable(): CancelablePromise<void> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const controller = new AbortController();
    handleCancel(() => controller.abort());
    chargeCard(controller.signal).then(resolve, reject);
  });
}

const checkout = reserveStockCancelable().then(() => chargeCardCancelable());
```

## Options

This rule accepts a single options object with the following property:

- `maxOperations` (integer, default `1`): the maximum number of asynchronous operations permitted to be started within an executor.

## When not to use it

Do not use this rule (or configure a higher `maxOperations` value) when an executor wraps a multi-step retry loop or an acknowledged sequence where intermediate cancellation is handled externally.
