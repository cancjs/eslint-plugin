# canc/must-consume-lazy

Ensure created LazyPromise instances are consumed.

A `LazyPromise` does not begin executing its underlying asynchronous operation until it is consumed. Unlike a standard eager `Promise` or `CancelablePromise`, dropping a `LazyPromise` without consuming it results in completely silent dead code where the executor never runs.

Consumption includes:

- Awaiting the promise with `await` or `.then()`, `.catch()`, or `.finally()` chaining.
- Explicit execution via `.execute()`.
- Explicit cancellation via `.cancel()`.
- Returning the instance from a function, storing it in an object property, collection, or exporting it.
- Passing the instance as an argument to another function.

## The void pitfall

Applying the `void` operator (e.g. `void LazyPromise.try(...)`) does not execute or consume a `LazyPromise`. The `void` operator merely suppresses floating-promise lint rules by evaluating the operand to `undefined`. Because the lazy instance is discarded without subscription, the operation will never run. To execute a `LazyPromise` without waiting for its value, call `.execute()`.

## Rule details

### Incorrect

```ts
import { LazyPromise } from '@cancjs/toolbox';

function process() {
  // Statement-level drop: executor never runs
  LazyPromise.try(() => compute());
}
```

```ts
import { LazyPromise } from '@cancjs/toolbox';

function process() {
  // void operator does NOT consume or execute the lazy promise
  void LazyPromise.try(() => compute());
}
```

```ts
import { LazyPromise } from '@cancjs/toolbox';

function process() {
  // Unused local variable holding lazy promise
  const task = LazyPromise.resolve(42);
}
```

### Correct

```ts
import { LazyPromise } from '@cancjs/toolbox';

async function process() {
  // Consumed via await
  const result = await LazyPromise.try(() => compute());
  return result;
}
```

```ts
import { LazyPromise } from '@cancjs/toolbox';

function process() {
  // Consumed via explicit .execute() invocation
  LazyPromise.try(() => compute()).execute();
}
```

```ts
import { LazyPromise } from '@cancjs/toolbox';

function getTask() {
  // Consumed by returning the instance
  return LazyPromise.resolve(42);
}
```

## Options

This rule does not accept any options.

## When not to use it

If your codebase relies on custom wrappers or proxies that register lazy promises outside lexical scope inspection, you can disable this rule or configure `settings.canc.lazyTypeNames`.
