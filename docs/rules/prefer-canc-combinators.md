# canc/prefer-canc-combinators

Prefer CancelablePromise combinators over native Promise combinators when any input is cancelable.

Native combinators like `Promise.all`, `Promise.race`, `Promise.any`, and `Promise.allSettled` perform cancellation-blind consumption. When a cancelable promise is passed into a native combinator, cancellation capability is lost. In `Promise.race`, when one promise settles first, native combinators leave the losing cancelable operations running in the background indefinitely. In `Promise.all`, when one input rejects, the remaining inputs are not cancelled. Additionally, the returned native promise cannot be cancelled from downstream consumers.

Replacing native combinators with their `CancelablePromise` counterparts preserves cancellation propagation: cancelling the combinator cancels all unfinished inputs, and race losers are automatically cancelled.

When a local `CancelablePromise` binding is imported, this rule provides an automated fix to replace `Promise.<method>` with `CancelablePromise.<method>`. If no local binding exists in file scope, a suggestion is provided. Explicit adoption via `Promise.resolve(cancPromise)` is intentional and is not flagged.

## Rule details

### Incorrect

```ts
const [user, orders] = await Promise.all([
  fetchUserCancelable(),
  fetchOrdersCancelable(),
]);
```

```ts
const first = Promise.race([
  fetchPrimary(),
  fetchMirror(),
]);
```

```ts
const results = Promise.allSettled([
  fetchA(),
  fetchB(),
]);
```

### Correct

```ts
const [user, orders] = await CancelablePromise.all([
  fetchUserCancelable(),
  fetchOrdersCancelable(),
]);
```

```ts
const first = CancelablePromise.race([
  fetchPrimary(),
  fetchMirror(),
]);
```

```ts
const results = CancelablePromise.allSettled([
  fetchA(),
  fetchB(),
]);
```

```ts
const adopted = Promise.resolve(fetchUserCancelable());
```

## Options

This rule has no options.

## When not to use it

If you intentionally want race losers to continue executing in the background and do not want downstream cancellation to propagate into combinator inputs, you can disable this rule for specific call sites.
