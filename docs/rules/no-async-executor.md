# canc/no-async-executor

📝 Disallow async functions as executor in CancelablePromise or LazyPromise.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

<!-- end auto-generated rule header -->

Disallow async functions as promise executors.

Passing an async function as a promise executor is problematic because any error thrown inside the async function will reject the async function's own internal promise rather than the surrounding `CancelablePromise`. Thrown errors are effectively lost. Furthermore, after cancellation occurs, an async executor cannot be stopped synchronously: execution continues across subsequent `await` expressions. An async IIFE inside the executor exhibits the same defects.

## Rule details

### Incorrect

```ts
const cancPromise = new CancelablePromise<string[]>(async (resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  try {
    const data = await fetchTitlesRaw(controller.signal);
    resolve(data.map((item) => item.title));
  } catch (err) {
    reject(err);
  }
});
```

```ts
const cancPromise = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  (async () => {
    resolve(await buildReport(controller.signal));
  })().catch(reject);
});
```

```ts
const cancPromise = new CancelablePromise<void>(async (resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  await doWork(controller.signal);
  resolve();
});
```

### Correct

```ts
const cancPromise = new CancelablePromise<RawTitle[]>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchTitlesRaw(controller.signal).then(resolve, reject);
}).then((data) => data.map((item) => item.title));
```

```ts
const cancPromise = new CancelablePromise<Report>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  buildReport(controller.signal).then(resolve, reject);
});
```

## When not to use it

There is rarely a reason to turn this rule off. If a wrapper you cannot change requires an async function as the executor, disable it for that line and make sure errors are caught and passed to `reject`.
