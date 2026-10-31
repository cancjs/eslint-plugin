# canc/no-keyword-alias-import

📝 Disallow importing keyword aliases from @cancjs/coroutine and @cancjs/coroutine/gen directly as named bindings; prefer canonical names or namespace imports.

💼⚠️ This rule is enabled in the 🔒 `strict` config. This rule _warns_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Disallow importing keyword alias names (`async`, `await`, `forAwait`, `delegate`, `throw`) from coroutine packages.

The `@cancjs/coroutine` and `@cancjs/coroutine/gen` packages export aliases named `async`, `await`, `forAwait`, `delegate`, and `throw` primarily for namespace import usage (`import * as canc from '@cancjs/coroutine'; canc.async(...)`, `canc.await(...)`, `canc.forAwait(...)`, `canc.delegate(...)`, `canc.throw(...)`).

Importing these exports as bare named bindings (`import { async, await, forAwait, delegate, throw as cancThrow }`) introduces identifiers that visually mimic reserved JavaScript keywords or renames canonical exports. In addition, IDE auto-import features can mistakenly suggest these bindings in place of actual language keywords. Renaming them on import (such as `import { async as cancAsync }`) is similarly discouraged because canonical named exports already exist.

Always use canonical named imports (`cancAsync`, `cancAwait`, `cancForAwait`, `cancGenAsync`, `cancGenAwait`, `cancGenForAwait`, `cancGenDelegate`, `cancThrow`, `cancGenThrow`) or use namespace imports.

## Rule details

### Incorrect

```ts
// Bare keyword named import
import { async, await as cancAwait } from '@cancjs/coroutine';
```

```ts
// Alias rename on import
import { async as cancAsync } from '@cancjs/coroutine';
```

### Correct

```ts
// Canonical named imports
import { cancAsync, cancAwait } from '@cancjs/coroutine';
```

```ts
// Namespace import
import * as canc from '@cancjs/coroutine';

const load = canc.async(function* () {
  const user = yield* canc.await(fetchUserCancelable());
  return user;
});
```

## When not to use it

If your project standardizes on custom import aliasing conventions across all modules, you can disable this rule.
