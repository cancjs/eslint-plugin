# canc/prefer-signal-option

📝 Prefer passing signal as constructor option over manual wiring or pre-abort check inside executor.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Prefer passing an external signal via constructor options rather than wiring it manually inside the executor.

When creating a `CancelablePromise` that links to an external `AbortSignal`, wiring the signal manually inside the executor body (by calling `signal.addEventListener('abort', ...)` or checking `signal.aborted`) is error-prone. Manual wiring often neglects:

1. Pre-aborted signals: if the signal is already aborted prior to executor execution, the event listener never fires.
2. Event listener removal: if the promise settles normally, the abort event listener can leak in memory until the signal is garbage-collected.
3. Multi-signal coordination: racing multiple cancellation triggers requires manual cleanup flags.

Instead, pass `{ signal }` in the second argument to `new CancelablePromise(executor, { signal })`. The constructor automatically handles pre-aborted states, cleans up listeners upon settlement, and integrates seamlessly with cancellation propagation.

## Rule details

### Incorrect

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource(signal: AbortSignal) {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    // Manual event listener wiring inside executor
    const onAbort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', onAbort);
    doFetch().then(resolve, reject);
  });
}
```

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource(signal: AbortSignal) {
  return new CancelablePromise((resolve, reject) => {
    // Manual aborted precheck inside executor
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    doFetch().then(resolve, reject);
  });
}
```

### Correct

```ts
import CancelablePromise from '@cancjs/promise';

function fetchResource(signal: AbortSignal) {
  // Pass signal via constructor options
  return new CancelablePromise((resolve, reject) => {
    doFetch().then(resolve, reject);
  }, { signal });
}
```

## When not to use it

If you are wrapping specialized legacy APIs where constructor options cannot be supplied or where custom event listener dispatch timing is strictly required, you can disable this rule.
