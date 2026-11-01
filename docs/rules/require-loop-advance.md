# canc/require-loop-advance

📝 Require loops over a cancForAwait handle or sugar form to advance the loop.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Require `for...of` loops over `yield* cancForAwait(source)` or a handle variable to advance the loop.

When consuming an `AsyncIterable` in a coroutine via `yield* cancForAwait(source)` or `const loop = yield* cancForAwait(source); for (const item of loop)`, the iteration handle requires advancing the underlying iterator via `yield* cancForAwait.next()` or `yield* loop.next()`. If a loop omits the advance statement, or if a `continue` statement branches before the advance statement runs, the next iteration attempt throws `IterationError` at runtime.

Moving the advance statement to the very beginning of the loop body ensures that every iteration step safely advances the iterator, even if subsequent code continues, breaks, or returns early.

## Rule details

This rule flags:

1. `for...of` loops over a single-argument `cancForAwait` call or handle variable that never advance the iterator.
2. `continue` statements that can execute before the iterator is advanced.

### Incorrect

```ts
import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  for (const item of yield* cancForAwait(source)) {
    yield* cancAwait(save(item));
  }
});
```

```ts
import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  const loop = yield* cancForAwait(source);
  for (const item of loop) {
    if (item.skip) continue;
    yield* cancAwait(save(item));
    yield* loop.next();
  }
});
```

### Correct

```ts
import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  for (const item of yield* cancForAwait(source)) {
    yield* cancForAwait.next();
    if (item.skip) continue;
    if (item.done) break;
    yield* cancAwait(save(item));
  }
});
```

```ts
import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  const loop = yield* cancForAwait(source);
  for (const item of loop) {
    if (item.done) break;
    yield* cancAwait(save(item));
    yield* loop.next();
  }
});
```

```ts
import { cancAsync, cancForAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (source: AsyncIterable<Item>) {
  yield* cancForAwait(source, (item) => {
    return save(item);
  });
});
```

## When not to use it

Correct code consuming `cancForAwait` loops does not need to disable this rule. In rare patterns with destructive sources where every iteration advances at the tail and no `continue` statements exist, advancing at the bottom of the loop body is permitted by the rule.
