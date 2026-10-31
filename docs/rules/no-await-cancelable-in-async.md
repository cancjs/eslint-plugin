# canc/no-await-cancelable-in-async

📝 Disallow awaiting cancelable promises in plain async functions.

💼 This rule is enabled in the following configs: ✅ `recommended`, 🔒 `strict`.

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

Disallow awaiting cancelable promises in plain async functions.

Awaiting a `CancelablePromise` inside a native `async` function results in cancellation-blind consumption. When cancellation occurs on an operation, the enclosing native `async` function cannot be cooperatively cancelled or halted midway: it continues executing subsequent statements across future `await` points, leading to stale updates and resource leaks.

Instead of plain `async` functions, use cancelable coroutines such as `cancAsync` (with `cancAwait`), or consume the cancelable promise at a terminal boundary using boundary helpers.

This rule requires TypeScript type information and is silent when parser services are disabled.

## Sanctioned forms

The following forms are explicitly permitted:

- Awaiting `.cancel()` in cleanup routines: `await p.cancel()`.
- Awaiting boundary helper functions that terminalize cancellation: `await catchCancel(p)`, `await suppressCancel(p)`, `await catchAbort(p)`, `await suppressAbort(p)`, `await catchTimeout(p)`, `await suppressTimeout(p)`, `await catchErrors(p, ...)`, `await suppressErrors(p, ...)`, or a function listed in the `boundaryFunctions` setting. Helpers are recognized through their imports, so renamed imports also count.
- Explicit adoption wrappers: `await Promise.resolve(p)` or `await (p as Promise<T>)`.

The rule also leaves these cases alone:

- A value typed as a union with a plain promise member, such as `Promise<T> | CancelablePromise<T>`. It may be a plain promise at run time, so the rule cannot tell. A union with `undefined` or `null`, such as `CancelablePromise<T> | undefined`, is still reported.
- Lazy promises. Their execution model is different and they are not checked here.
- A coroutine body, which uses `yield* cancAwait(...)` instead of `await`. An `async` function written inside a coroutine body is still a plain async function and is checked.

## for await

`for await (const x of items)` in a plain async function is reported when `items` is an array or tuple of cancelable promises. Other iterables, such as a `Set` or a generator, are not checked.

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
- `allowInFunctions` (default: `[]`): Function names whose bodies may await cancelable promises, for example framework entry points or test suites. Each entry is an exact name or a `'/pattern/flags'` regular expression string (flags `g` and `y` are not allowed). The name is the function declaration name, the variable a function expression or arrow function initializes, or the method or property key. The allowance covers only that function body, not async functions nested inside it.

## When not to use it

If you are maintaining a legacy codebase that cannot adopt `@cancjs/coroutine` generators and intentionally manages cancellation boundaries via external orchestration or manual signal listeners.
