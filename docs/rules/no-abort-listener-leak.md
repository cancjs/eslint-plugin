# canc/no-abort-listener-leak

Disallow registering abort event listeners on external signals without guaranteed removal or once option.

Registering an `'abort'` event listener on an external `AbortSignal` via `signal.addEventListener('abort', handler)` creates a memory leak if the listener is not removed when the associated operation finishes. Because external signals often outlive individual sub-tasks, registered listeners accumulate in memory and retain closures over local variables.

To prevent listener leaks, you must ensure that:

1. The listener is removed on all possible completion paths using `signal.removeEventListener('abort', handler)`. A removal in a `finally` block, or in the callback of a promise `.finally(...)` call in the same function, counts. A listener added inside a `new Promise` executor (or a `forEach`/`map` callback) is checked against the function that encloses it, so a removal in that function's `finally` block, including one made through a `forEach` over a list of registered listeners, counts too.
2. Or the listener is registered with `{ once: true }` when a single event dispatch is sufficient.

Locally instantiated `AbortController` or `createAbortSignal()` instances whose lifespan is confined to the local function scope are not flagged. This includes the signals of local controllers collected into a `const` array literal and reached through `array.map((signal) => ...)`, as long as the array and every controller behind it are created by the same function.

## Rule details

### Incorrect

```ts
function watchOperation(signal: AbortSignal) {
  const onAbort = () => console.log('aborted');
  // Leaks listener if the operation settles before aborting
  signal.addEventListener('abort', onAbort);
  return performAsyncWork();
}
```

```ts
function watchOperation(signal: AbortSignal) {
  const onAbort = () => console.log('aborted');
  signal.addEventListener('abort', onAbort);
  try {
    performWork();
  } catch (err) {
    // Missing removal on catch path
    throw err;
  }
  signal.removeEventListener('abort', onAbort);
}
```

### Correct

```ts
function watchOperation(signal: AbortSignal) {
  const onAbort = () => console.log('aborted');
  // Registered with { once: true }
  signal.addEventListener('abort', onAbort, { once: true });
  return performAsyncWork();
}
```

```ts
function watchOperation(signal: AbortSignal) {
  const onAbort = () => console.log('aborted');
  signal.addEventListener('abort', onAbort);
  try {
    return performWork();
  } finally {
    // Guaranteed cleanup on all paths
    signal.removeEventListener('abort', onAbort);
  }
}
```

```ts
function watchOperation(signal: AbortSignal) {
  const onAbort = () => console.log('aborted');
  signal.addEventListener('abort', onAbort);
  // The finally callback runs however the promise settles
  return performAsyncWork().finally(() => {
    signal.removeEventListener('abort', onAbort);
  });
}
```

## Options

This rule does not accept any options.

## When not to use it

This rule belongs to the strict tier. You may disable this rule or use an eslint-disable comment for:

- Long-lived signal listeners designed to remain active for the entire duration of an application lifecycle or process.
- Low-level event adapters where listener removal is handled by an external abstraction or garbage collection boundary.
- Test suites where signals are instantiated per test case and discarded immediately.
