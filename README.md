# @cancjs/eslint-plugin

ESLint rules that keep cancellation intact in code that uses `@cancjs/*`.

Cancellation is viral. A cancelable promise only stays cancelable if every consumer passes the cancel handle along. When a plain `async` function awaits it, or a native `Promise.all` wraps it, nobody holds the handle anymore. The work keeps running after the cancel, and the type system does not complain.

This plugin finds those spots. It reports cancelable promises consumed by code that cannot cancel them, executors that start work they never stop, catch blocks that swallow a cancellation, and coroutines that mix helper styles. Each message names the problem, says what goes wrong at runtime and shows the fix.

The blessed idioms from the `@cancjs/*` docs are never flagged by the `recommended` preset.

## Install

```sh
npm install --save-dev @cancjs/eslint-plugin
```

Peer dependencies: `eslint` 9 or 10. Rules that read types also need `@typescript-eslint/parser` 8 and `typescript`. Both are optional. Node versions are as declared in `engines`.

## Quick start

Add the preset to your flat config. The parser line is only needed for TypeScript files.

```js
// readme-test
import canc from '@cancjs/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  { files: ['**/*.ts'], languageOptions: { parser: tsParser } },
  ...canc.configs.recommended,
];
```

In a plain JavaScript project, spread `canc.configs.recommended` and nothing else.

## Typed setup

Some rules compare types, for example to tell a cancelable promise from a plain one. Turn on `projectService` to give them type information.

```js
// readme-test
import canc from '@cancjs/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, parserOptions: { projectService: true } },
  },
  ...canc.configs.recommended,
];
```

Type-aware rules are silent without type information. They do not guess. The rules list below marks them with a type information icon.

## Presets

The icons in the rules list show which preset enables each rule. This table says what each preset is for.

| Preset                    | Contents                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `recommended`             | Rules that never flag the blessed idioms. Some rules are set to warn.         |
| `strict`                  | `recommended` with warnings promoted to errors, plus the stricter rules.      |
| `stylistic`               | Style-only rules, set to warn.                                                |
| `interopTypescriptEslint` | Settings for typescript-eslint rules that would otherwise fight these idioms. |
| `interopPromise`          | Turns off eslint-plugin-promise rules that conflict with cancelable promises. |
| `interopUnicorn`          | Turns off eslint-plugin-unicorn rules that conflict with cancelable promises. |

The same presets are exported from `@cancjs/eslint-plugin/native` for the rules that apply to native-twin consumers.

## Settings

Shared settings live under `settings.canc`. Every key is optional. List keys add to the built-in values and never replace them.

```js
// readme-test
import canc from '@cancjs/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
    settings: {
      canc: {
        sources: ['@acme/cancel-utils'],
        cancelableTypeNames: ['AcmeTask'],
      },
    },
  },
  ...canc.configs.recommended,
];
```

- `sources`: module specifiers that export cancelable APIs. All `@cancjs/*` packages are built in. Add your own wrappers here.
- `cancelableTypeNames`: type names treated as cancelable promises. Default `['CancelablePromise']`.
- `lazyTypeNames`: type names treated as lazy cancelable promises. Default `['LazyPromise']`.
- `structuralDetection`: default `false`. When `true`, any type with a callable `then` and a callable `cancel` counts as a cancelable promise.
- `boundaryFunctions`: helper names that end a cancelable flow on purpose, such as `catchCancel` and `suppressCancel`. Your own helpers are added to the built-in list.

### Structural detection trade-off

By default a type counts as cancelable only when it is named in `cancelableTypeNames` or comes from a listed source. Turning on `structuralDetection` widens that to every type with `then` and `cancel`, including types from libraries you do not control. That catches wrapper types you did not list.

The wider match applies to every rule that reads types. It also changes the advice. The fixes those rules suggest name canc APIs, such as `CancelablePromise.fail` and `cancAsync`, even when the foreign type has nothing to do with them. Leave the option off unless you have such wrappers and have checked the results.

## Interop

The plugin ships configs that settle conflicts with typescript-eslint, eslint-plugin-promise and eslint-plugin-unicorn. They hold rule entries only and add no dependency. See the [interop guide](https://github.com/cancjs/eslint-plugin/blob/master/docs/interop.md).

## Native entry

Packages that use the native-twin builds import from `@cancjs/eslint-plugin/native`. It exports the same three presets, limited to the rules that apply there.

## Coroutine factories

Rules that check coroutine helpers accept options that add your own factory functions or replace the built-in ones. The options are described on the rule pages, for example [exhaustive-catch](https://github.com/cancjs/eslint-plugin/blob/master/docs/rules/exhaustive-catch.md). The full list of rules follows.

## Rules

<!-- begin auto-generated rules list -->

💼 Configurations enabled in.\
⚠️ Configurations set to warn in.\
✅ Set in the `recommended` configuration.\
🔒 Set in the `strict` configuration.\
🎨 Set in the `stylistic` configuration.\
🔧 Automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).\
💡 Manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).\
💭 Requires [type information](https://typescript-eslint.io/linting/typed-linting).

| Name                                                                         | Description                                                                                                                                                  | 💼    | ⚠️  | 🔧  | 💡  | 💭  |
| :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :---- | :-- | :-- | :-- | :-- |
| [canc-throw-tail-position](docs/rules/canc-throw-tail-position.md)           | Require 'return yield* canc.throw(...)' in tail position so following code is unreachable.                                                                   | ✅ 🔒 |     | 🔧  | 💡  |     |
| [executor-cancel-wiring](docs/rules/executor-cancel-wiring.md)               | Require cancelable promise executors to wire cancellation to underlying operations.                                                                          | 🔒    |     |     |     |     |
| [executor-param-names](docs/rules/executor-param-names.md)                   | Enforce standard parameter names for cancelable promise executors.                                                                                           |       | 🎨  |     |     |     |
| [exhaustive-catch](docs/rules/exhaustive-catch.md)                           | Require coroutine catch blocks to handle or rethrow all declared failure types.                                                                              | 🔒    | ✅  |     | 💡  | 💭  |
| [handle-cancel-first](docs/rules/handle-cancel-first.md)                     | Require cancel handlers to be registered synchronously at the top of the executor.                                                                           | ✅ 🔒 |     |     |     |     |
| [must-consume-lazy](docs/rules/must-consume-lazy.md)                         | Ensure LazyPromise instances are consumed rather than dropped.                                                                                               | ✅ 🔒 |     |     |     |     |
| [no-abort-listener-leak](docs/rules/no-abort-listener-leak.md)               | Require removing abort listeners on all code paths or using { once: true } to prevent leaks.                                                                 | 🔒    |     |     |     |     |
| [no-async-executor](docs/rules/no-async-executor.md)                         | Disallow async functions as executor in CancelablePromise or LazyPromise.                                                                                    | ✅ 🔒 |     |     |     |     |
| [no-async-loop-callback](docs/rules/no-async-loop-callback.md)               | Disallow async callbacks in cancForAwait and cancGenForAwait loops.                                                                                          | 🔒    | ✅  |     | 💡  |     |
| [no-await-cancelable-in-async](docs/rules/no-await-cancelable-in-async.md)   | Disallow awaiting cancelable promises in plain async functions                                                                                               | ✅ 🔒 |     |     |     | 💭  |
| [no-cancelability-erasure](docs/rules/no-cancelability-erasure.md)           | Disallow passing or returning cancelable promises where plain promises are expected                                                                          | ✅ 🔒 |     |     |     | 💭  |
| [no-cancellation-gap](docs/rules/no-cancellation-gap.md)                     | Disallow non-cancelable promise steps inside cancelable flows and chains.                                                                                    | 🔒    |     |     |     |     |
| [no-coroutine-dialect-mismatch](docs/rules/no-coroutine-dialect-mismatch.md) | Disallow mixing coroutine helper dialects inside coroutine bodies.                                                                                           | ✅ 🔒 |     |     |     |     |
| [no-executor-return](docs/rules/no-executor-return.md)                       | Disallow returning values from CancelablePromise or LazyPromise executors.                                                                                   | ✅ 🔒 |     |     |     |     |
| [no-failure-widening](docs/rules/no-failure-widening.md)                     | Disallow casts and type annotations that drop declared failure types.                                                                                        | 🔒    | ✅  |     | 💡  | 💭  |
| [no-internal-imports](docs/rules/no-internal-imports.md)                     | Disallow imports from non-public internal package subpaths in @cancjs.                                                                                       | ✅ 🔒 |     | 🔧  | 💡  |     |
| [no-keyword-alias-import](docs/rules/no-keyword-alias-import.md)             | Disallow importing keyword aliases from @cancjs/coroutine and @cancjs/coroutine/gen directly as named bindings; prefer canonical names or namespace imports. | 🔒    | ✅  | 🔧  |     |     |
| [no-multistep-executor](docs/rules/no-multistep-executor.md)                 | Disallow starting multiple async operations in one executor.                                                                                                 | 🔒    | ✅  |     |     |     |
| [no-swallowed-cancel](docs/rules/no-swallowed-cancel.md)                     | Disallow catch handlers on cancelable flows that swallow the cancellation                                                                                    | 🔒    | ✅  |     | 💡  |     |
| [no-throw-in-chain-callback](docs/rules/no-throw-in-chain-callback.md)       | Require returning CancelablePromise.fail() instead of throwing inside chain callbacks on cancelable promises.                                                | 🔒    | ✅  |     | 💡  | 💭  |
| [no-transform-in-executor](docs/rules/no-transform-in-executor.md)           | Disallow transforming data before resolving in executor.                                                                                                     |       | 🎨  |     | 💡  |     |
| [no-unstarred-cancawait](docs/rules/no-unstarred-cancawait.md)               | Require yield* on cancAwait calls and disallow unused statement-position cancAwait calls.                                                                    | ✅ 🔒 |     | 🔧  |     |     |
| [no-yield-await-in-loop](docs/rules/no-yield-await-in-loop.md)               | Disallow serialized yield* cancAwait in loops where steps appear independent.                                                                                | 🔒    |     |     |     |     |
| [prefer-canc-combinators](docs/rules/prefer-canc-combinators.md)             | Prefer CancelablePromise combinators over native Promise combinators when inputs are cancelable                                                              | ✅ 🔒 |     | 🔧  | 💡  | 💭  |
| [prefer-canc-throw](docs/rules/prefer-canc-throw.md)                         | Require yield* canc.throw(...) instead of bare throw in coroutines.                                                                                          | 🔒    | ✅  |     | 💡  | 💭  |
| [prefer-cancawait](docs/rules/prefer-cancawait.md)                           | Prefer yield* cancAwait(...) over bare yield inside cancAsync coroutines.                                                                                    | 🔒    | ✅  | 🔧  |     |     |
| [prefer-cancel-aware-wrapper](docs/rules/prefer-cancel-aware-wrapper.md)     | Prefer cancelify or promisify over hand-rolled signal threading and finally abort.                                                                           | 🔒    |     |     |     |     |
| [prefer-canceled-property](docs/rules/prefer-canceled-property.md)           | Prefer 'canceled' over deprecated 'isCanceled' property on cancelables.                                                                                      | 🔒    | ✅  | 🔧  | 💡  |     |
| [prefer-is-cancel-error](docs/rules/prefer-is-cancel-error.md)               | Prefer brand-checking functions over instanceof or name checks for cancellation errors                                                                       | ✅ 🔒 |     | 🔧  | 💡  | 💭  |
| [prefer-signal-accessor](docs/rules/prefer-signal-accessor.md)               | Prefer 'signal' accessor over deprecated 'getSignal()' on executor context.                                                                                  | 🔒    | ✅  | 🔧  | 💡  |     |
| [prefer-signal-option](docs/rules/prefer-signal-option.md)                   | Prefer passing signal as constructor option over manual wiring or pre-abort check inside executor.                                                           | 🔒    | ✅  |     | 💡  |     |
| [prefer-signal-over-controller](docs/rules/prefer-signal-over-controller.md) | Prefer passing AbortSignal instead of AbortController.                                                                                                       | 🔒    | ✅  |     | 💡  |     |
| [require-error-discriminant](docs/rules/require-error-discriminant.md)       | Require declared error classes in failure sets to have a discriminant property.                                                                              | 🔒    | ✅  |     | 💡  | 💭  |
| [require-signal-forwarding](docs/rules/require-signal-forwarding.md)         | Require AbortController signals to be forwarded to operations when cancel aborts the controller.                                                             | 🔒    | ✅  |     |     |     |
| [valid-canc-params](docs/rules/valid-canc-params.md)                         | Enforce valid parameter count and shapes for cancelable promise methods.                                                                                     | ✅ 🔒 |     |     |     |     |
| [valid-cancasync](docs/rules/valid-cancasync.md)                             | Ensure coroutines are driven by valid generator functions with proper type annotations.                                                                      | ✅ 🔒 |     |     |     |     |

<!-- end auto-generated rules list -->
