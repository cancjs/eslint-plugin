# canc/prefer-signal-over-controller

Prefer passing AbortSignal rather than whole AbortController.

Accepting a whole `AbortController` parameter, or forwarding a controller instance to a downstream function, hands `abort()` capability to code that does not own the controller. Platform conventions pass `AbortSignal`, keeping `abort()` control with the creator of the controller.

When TypeScript parser services are present, this rule inspects full type information to flag `AbortController` parameters and forwarded call arguments. In environments without parser services, a syntactic fallback flags call arguments initialized via local `new AbortController()` calls and parameters explicitly annotated with the `AbortController` type name. Operating without parser services means fewer reports will be produced because inferred types cannot be analyzed.

## Rule details

### Incorrect

```ts
function loadWithController(controller: AbortController): CancelablePromise<Report> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    handleCancel(() => controller.abort());
    buildReport(controller.signal).then(resolve, reject);
  });
}
```

```ts
function pipeline(controller: AbortController) {
  return fetchStage(controller);
}
```

### Correct

```ts
function loadWithSignal(signal: AbortSignal): CancelablePromise<Report> {
  return new CancelablePromise((resolve, reject) => {
    buildReport(signal).then(resolve, reject);
  }, { signal });
}
```

```ts
function pipeline(signal: AbortSignal) {
  return fetchStage(signal);
}
```

## Options

This rule accepts a single options object with the following property:

- `allowedCallees` (array of strings, default `[]`): callee names or member expression paths permitted to receive an `AbortController`.
