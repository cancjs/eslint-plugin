# canc/no-async-loop-callback

📝 Disallow async callbacks in cancForAwait and cancGenForAwait loops.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Disallow async function callbacks for `cancForAwait` and `cancGenForAwait`.

The `cancForAwait` and `cancGenForAwait` helpers iterate over asynchronous streams while participating in coroutine cancellation. Passing an `async` function as the per-item iteration callback breaks cancellation propagation:

1. Inside an `async` callback, `await` statements evaluate native promises that cannot be canceled or interrupted by the enclosing coroutine driver.
2. If cancellation occurs between stream pulls while an `async` callback is executing, the callback continues running to completion in the background, escaping the cancellation boundary.

To ensure cooperative cancellation within stream processing, write the callback as a generator function (`function*`) using `yield* cancAwait(...)` or use a synchronous callback.

## Rule details

### Incorrect

```ts
import { cancAsync, cancForAwait } from '@cancjs/coroutine';

const processStream = cancAsync(function* (source: AsyncIterable<Item>) {
  // Async callback: awaits are non-cancelable and escape the cancellation boundary
  yield* cancForAwait(source, async (item) => {
    await processItem(item);
  });
});
```

### Correct

```ts
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';

const processStream = cancAsync(function* (source: AsyncIterable<Item>) {
  // Generator callback participates fully in cancellation
  yield* cancForAwait(source, function* (item) {
    yield* cancAwait(processItem(item));
  });
});
```

```ts
import { cancAsync, cancForAwait } from '@cancjs/coroutine';

const processStream = cancAsync(function* (source: AsyncIterable<Item>) {
  // Synchronous callback is permitted
  yield* cancForAwait(source, (item) => {
    recordItem(item);
  });
});
```

## When not to use it

If your stream processing deliberately performs fire-and-forget background operations where cancellation must be ignored, you can disable this rule.
