# Interop with other plugins

Some rules from other plugins fight the idioms this plugin blesses. The plugin ships three small configs that settle those conflicts. They hold rule entries only and never import the other plugins, so nothing here adds a dependency.

```js
import canc from '@cancjs/eslint-plugin';

export default [
  ...canc.configs.recommended,
  ...canc.configs.interopTypescriptEslint,
  ...canc.configs.interopPromise,
  ...canc.configs.interopUnicorn,
];
```

Load the other plugins before these configs. ESLint accepts an `off` entry for a plugin it does not know, but it throws on an `error` entry. The promise and unicorn configs contain only `off` entries and are safe either way. The typescript-eslint config enables rules, so it needs typescript-eslint loaded first, with type information available. Without it ESLint stops with `Could not find plugin "@typescript-eslint"`.

## typescript-eslint

`@typescript-eslint/no-floating-promises` is the backbone. It is set to `error` with `checkThenables: true`, so a lazy cancelable promise that is created and dropped is reported too. A bare `p.cancel()` statement is a floating promise. Write `void p.cancel()` when you do not need to wait for the cancellation to finish, and `await p.cancel()` when you do. Both forms are accepted.

`@typescript-eslint/no-misused-promises` stays on at `error`. It catches a cancelable promise passed where a void callback is expected.

`@typescript-eslint/promise-function-async` is turned off. It reports every non-async function that returns a cancelable promise, and its autofix adds `async`. That wraps the returned value in a native promise, and the result can no longer be canceled.

`@typescript-eslint/return-await` is set to `in-try-catch`. A returned promise is awaited inside `try` and `catch`, so a cancellation is caught where you handle it, and plain returns stay cheap elsewhere.

`@typescript-eslint/use-unknown-in-catch-callback-variable` stays on at `error`. It pairs with `isCancelError(error)`, which takes an `unknown` value.

## eslint-plugin-promise

`promise/prefer-await-to-then` is turned off. The executor idiom `fn().then(resolve, reject)` and chained cancelable promises are both normal here.

`promise/prefer-catch` is turned off. Its autofix rewrites any two-argument `.then(onFulfilled, onRejected)` into `.then(onFulfilled).catch(onRejected)`. The two forms are not equivalent: in the rewritten chain the catch handler also sees errors thrown by `onFulfilled`. This applies to every two-argument chain, not only executors.

`promise/prefer-await-to-callbacks` is turned off because it pushes toward `async` and `await` where generator-based coroutines are the intended style.

`promise/catch-or-return` and `promise/always-return` are turned off. Both report the executor idiom, and `no-floating-promises` already covers the real defect. Every other promise rule is left as you configured it.

If you prefer to keep those two rules, add this block after `interopPromise`. The options tolerate the idiom:

```js
{
  rules: {
    'promise/catch-or-return': ['error', { allowThen: true }],
    'promise/always-return': ['error', { ignoreLastCallback: true }],
  },
}
```

## eslint-plugin-unicorn

`unicorn/prefer-top-level-await` is turned off. Coroutine entry points are invoked as plain calls, and the rule pushes toward `await` at module level.

`unicorn/no-thenable` is a problem only in code that defines a thenable, such as a lazy promise implementation. The default config leaves it on. To turn it off for those files only, add an entry limited by a glob:

```js
{ files: ['src/lazy/**/*.ts'], rules: { 'unicorn/no-thenable': 'off' } }
```
