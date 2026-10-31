# canc/no-transform-in-executor

📝 Disallow transforming data before resolving in executor.

⚠️ This rule _warns_ in the 🎨 `stylistic` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Disallow transforming data before resolving in executor.

Transforming data inside an executor mixes data transformation logic into the adapter layer. Any exception thrown during data transformation inside the executor must be manually caught and routed to `reject`, whereas performing transformations in a chained `.then` method propagates errors naturally through the promise chain.

## Rule details

### Incorrect

```ts
const titles = new CancelablePromise<string[]>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchTitlesRaw(controller.signal).then(
    (data) => resolve(data.map((item) => item.title)),
    reject,
  );
});
```

### Correct

```ts
const titles = new CancelablePromise<RawTitle[]>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchTitlesRaw(controller.signal).then(resolve, reject);
}).then((data) => data.map((item) => item.title));
```

Type assertions, non-null assertions and `satisfies` do not change the value, so `resolve(data as string)` and `resolve(data!)` pass. A literal, a unary applied to a literal, and an object or array made only of literals count as raw values: `resolve(-1)`, `resolve(void 0)` and `resolve({ ok: true })` are not reported.

## Limitations

- A call with a plain identifier as callee, such as `resolve(norm(d))`, is treated as handing over an operation, not as a transform.

## Options

This rule accepts a single options object with the following property:

- `allowPropertyAccess` (boolean, default `false`): when set to `true`, resolving with a direct property access (such as `resolve(data.items)`) is permitted without being flagged as a transformation.
