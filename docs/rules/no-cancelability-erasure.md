# canc/no-cancelability-erasure

Disallow passing or returning cancelable promises where plain promises are expected.

Cancelability erasure occurs when a `CancelablePromise` is silently widened or passed into a cancellation-blind sink (such as a plain `Promise<T>` or `PromiseLike<T>`), causing downstream consumers to lose the ability to cancel the underlying task. This creates resource leaks and prevents cooperative abort signals from propagating.

This rule requires TypeScript type information and runs only when parser services are enabled. Without type information, this rule reports nothing.

## Erasure buckets

TypeScript patterns fall into three distinct buckets:

1. **Accidental sinks (Reported)**: The sink's declaration specifies a plain `Promise` or `PromiseLike` type, erasing cancelability without deliberate intent in the expression.
   - Function or method call arguments passed to parameters typed `Promise<T>` or `PromiseLike<T>`.
   - Return expressions in functions or arrow callbacks with declared `Promise<T>` return types.
   - Variable declarations and assignments with widening type annotations like `const p: Promise<T> = getCancelable()`.
   - Object literal properties and class fields typed as plain `Promise<T>`.

2. **Explicit assertions and adoptions (Sanctioned)**: The code deliberately marks an intent to convert or bridge cancelability:
   - Explicit wrapper functions such as `Promise.resolve(cancPromise)` or `new Promise((resolve) => resolve(cancPromise))`.
   - Type assertions such as `cancPromise as Promise<T>`, `<Promise<T>>cancPromise` and `cancPromise as unknown as Promise<T>`, plus the JSDoc cast `/** @type {Promise<T>} */ (cancPromise)`.
   - Boundary helpers such as `catchCancel(p)`, `suppressCancel(p)`, `catchAbort(p)`, `suppressAbort(p)`, `catchTimeout(p)`, and `suppressTimeout(p)`, plus any function named in the `boundaryFunctions` shared setting.

3. **Not erasure (Preserved)**:
   - `p satisfies Promise<T>`: Asserts promise compatibility without changing or downgrading the expression's static type. Use `satisfies Promise<T>` when verifying interface compatibility while keeping full cancelability. The value stays cancelable, so passing it on into a plain promise sink is still reported.
   - Union sinks typed `Promise<T> | CancelablePromise<T>`.
   - Non-null assertions `p!`.

## Rule details

### Incorrect

```ts
declare function trackPromise(p: Promise<User>): void;

trackPromise(fetchUserCancelable());
```

```ts
async function getUser(): Promise<User> {
  return fetchUserCancelable();
}
```

```ts
const pending: Promise<User> = fetchUserCancelable();
```

```ts
declare function enqueue(job: PromiseLike<void>): void;

enqueue(fetchJobCancelable());
```

### Correct

```ts
declare function trackPromise(p: Promise<User>): void;

trackPromise(Promise.resolve(fetchUserCancelable()));
```

```ts
function getUser(): CancelablePromise<User> {
  return fetchUserCancelable();
}
```

```ts
const pending = fetchUserCancelable();
```

```ts
const compatible = fetchUserCancelable() satisfies Promise<User>;
```

```ts
import { catchCancel } from '@cancjs/promise';

declare function trackPromise(p: Promise<User>): void;

trackPromise(catchCancel(fetchUserCancelable()));
```

## Options

This rule accepts an optional configuration object:

```json
{
  "canc/no-cancelability-erasure": [
    "error",
    {
      "allowExplicitWrap": true,
      "allowAsCast": true,
      "allowAnnotationWidening": false,
      "allowForKnownSafeSinks": [],
      "checkArguments": true,
      "checkReturns": true,
      "checkAssignments": true,
      "checkProperties": true,
      "retainedHandle": true
    }
  ]
}
```

- `allowExplicitWrap` (default: `true`): Allows deliberate wrapping via `Promise.resolve(canc)` or `new Promise((resolve) => resolve(canc))`.
- `allowAsCast` (default: `true`): Allows type assertions like `canc as Promise<T>`.
- `allowAnnotationWidening` (default: `false`): Disallows annotating a variable or property with `Promise<T>` when assigned a `CancelablePromise`. Set to `true` to allow type widening annotations.
- `allowForKnownSafeSinks` (default: `[]`): An array of callee specifiers known to safely handle cancelable promises through promise-typed parameters.
- `checkArguments` (default: `true`): Reports cancelable promises passed into plain promise function parameters.
- `checkReturns` (default: `true`): Reports cancelable promises returned from functions annotated with plain promise return types.
- `checkAssignments` (default: `true`): Reports assignment to variables or parameters typed as plain promises.
- `checkProperties` (default: `true`): Reports cancelable promises assigned to plain promise object properties or class fields.
- `retainedHandle` (default: `true`): Skips reporting when the source is a local `const` or `let` declared in the same function with a visible cancel path: a `.cancel` access on it, the variable passed as the `ref` option of a `new` expression, a `promise` destructured together with `cancel` from `withResolvers()`, or a value started with the `signal` of a local `AbortController`. Direct call results never qualify.

## Limitations

The rule does not check the return value of a callback passed straight to a call (such as a `.then` callback) unless the callback declares its own return type, since the callee decides what happens to it. Arguments passed to functions declared by the canc packages are not checked, and lazy promises are out of scope. `await` operands, native combinator arguments and floating promises are left to other rules. An async function without a return annotation is not reported, because its return has no declared type. On an async function that does declare `Promise<T>`, the message suggests dropping `async` instead of keeping the cancelable type, since an async function cannot return a cancelable promise type.

## When not to use it

If a project intentionally interfaces with third-party promise libraries where cancellation handles are not needed, or in environments where typed linting via TypeScript parser services cannot be configured.
