# canc/no-await-cancelable-in-async

Disallow awaiting cancelable promises in plain async functions.

Awaiting a `CancelablePromise` inside a native `async` function results in cancellation-blind consumption. When cancellation occurs on an operation, the enclosing native `async` function cannot be cooperatively cancelled or halted midway: it continues executing subsequent statements across future `await` points, leading to stale updates and resource leaks.

Instead of plain `async` functions, use cancelable coroutines such as `cancAsync` (with `cancAwait`), or consume the cancelable promise at a terminal boundary using boundary helpers.

This rule requires TypeScript type information and is silent when parser services are disabled.

## Sanctioned forms

The following forms are explicitly permitted:

- Awaiting `.cancel()` in cleanup routines: `await p.cancel()`.
- Awaiting boundary helper functions that terminalize cancellation: `await catchCancel(p)`, `await suppressCancel(p)`, `await catchAbort(p)`, `await suppressAbort(p)`, `await catchTimeout(p)`, or `await suppressTimeout(p)`.
- Explicit adoption wrappers: `await Promise.resolve(p)` or `await (p as Promise<T>)`.

## Rule details

### Incorrect

```ts
async function loadData(query: string): Promise<User[]> {
  const users = await searchCancelable(query);
  return users;
}
```

```ts
const handler = async () => {
  const details = await fetchDetailsCancelable(id);
  render(details);
};
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const loadData = cancAsync(function* (query: string) {
  const users = yield* cancAwait(searchCancelable(query));
  return users;
});
```

```ts
import { catchCancel } from '@cancjs/promise';

async function loadData(query: string): Promise<User[]> {
  const result = await catchCancel(searchCancelable(query));
  return result ?? [];
}
```

```ts
async function cleanup(p: CancelablePromise<void>): Promise<void> {
  await p.cancel();
}
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/no-await-cancelable-in-async": [
    "error",
    {
      "allowTopLevel": true,
      "allowInFunctions": []
    }
  ]
}
```

- `allowTopLevel` (default: `true`): Allows awaiting cancelable promises at the module top level (outside of any function body).
- `allowInFunctions` (default: `[]`): An array of function names or regular expression pattern strings that are permitted to await cancelable promises (for example, framework top-level handlers or test suites).

## When not to use it

If you are maintaining a legacy codebase that cannot adopt `@cancjs/coroutine` generators and intentionally manages cancellation boundaries via external orchestration or manual signal listeners.
