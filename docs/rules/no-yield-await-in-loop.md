# canc/no-yield-await-in-loop

Disallow awaiting cancelable steps sequentially inside iteration loops.

Using `yield* cancAwait(...)` inside `for`, `for-of`, `for-in`, `while`, or `do-while` loops executes each iteration sequentially. When loop iterations are independent and can run concurrently, awaiting each step sequentially serializes operations and increases total execution time.

Independent operations should be initiated concurrently using `cancAwait.all(...)`. Loops where subsequent iterations depend on variables updated or read across iterations (such as accumulator variables or sequential dependencies) are permitted.

## Rule details

### Incorrect

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (ids: string[]) {
  const results = [];
  for (const id of ids) {
    // Serialized independent steps: should be batched
    const item = yield* cancAwait(fetchItem(id));
    results.push(item);
  }
  return results;
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const processItems = cancAsync(function* (ids: string[]) {
  // Concurrent execution using cancAwait.all
  const results = yield* cancAwait(
    CancelablePromise.all(ids.map((id) => fetchItem(id)))
  );
  return results;
});
```

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const processChain = cancAsync(function* (initialId: string) {
  let currentId = initialId;
  for (let i = 0; i < 5; i++) {
    // Deliberately sequential: next step depends on previous result
    const nextItem = yield* cancAwait(fetchNext(currentId));
    currentId = nextItem.nextId;
  }
  return currentId;
});
```

## Options

This rule does not accept any options.

## When not to use it

This rule belongs to the strict tier. You may disable this rule or use an eslint-disable comment for:

- Deliberately sequential loops, such as rate-limited API calls, retry backoffs, or ordered database migrations.
- Resource-constrained loops where parallel execution would overwhelm system memory or connection pools.
- Teaching examples illustrating sequential iteration logic.
