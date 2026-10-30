# canc/prefer-cancawait

Require `yield* cancAwait(...)` instead of bare `yield` in `cancAsync` coroutines.

Inside a `cancAsync` coroutine body, yielding a promise directly via a bare `yield expr` works at runtime, but it destroys TypeScript per-step type inference. In TypeScript, generator functions evaluate any plain `yield` expression to the generator-wide `TNext` parameter, which typically defaults to `unknown`.

The `cancAwait(promise)` helper returns a one-shot generator whose `TReturn` parameter is typed as `Awaited<T>`. When evaluated using generator delegation via `yield* cancAwait(promise)`, TypeScript resolves the expression to the generator's return type. This yield-vs-yield-star typing mechanism gives each step a precise, strongly-typed result without collapsing types to `unknown` or dropping declared failure types.

Delegating to sub-generators using `yield* subGenerator()` and bare checkpoints (`yield;`) with no operand are permitted.

## Rule details

### Incorrect

```ts
import { cancAsync } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  // Bare yield collapses user type to unknown
  const user = yield fetchUserCancelable();
  return user;
});
```

### Correct

```ts
import { cancAsync, cancAwait } from '@cancjs/coroutine';

const load = cancAsync(function* () {
  // yield* cancAwait preserves the inferred User type
  const user = yield* cancAwait(fetchUserCancelable());
  return user;
});
```

```ts
import { cancAsync } from '@cancjs/coroutine';

function* fetchSubSteps() {
  // Generator delegation is allowed
  yield* otherStep();
}

const load = cancAsync(function* () {
  yield* fetchSubSteps();
});
```

## Options

This rule accepts an optional options object with the following property:

- `allowBareYield` (boolean, default: `false`): When set to `true`, bare `yield <expr>` expressions are permitted in `cancAsync` bodies without reporting.

```json
{
  "rules": {
    "canc/prefer-cancawait": [
      "warn",
      {
        "allowBareYield": false
      }
    ]
  }
}
```

## When not to use it

If your codebase relies on untyped generator steps or opts out of per-step type inference, you can set `allowBareYield: true` or disable this rule.
