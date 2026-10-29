# canc/no-internal-imports

Disallow importing internal or undocumented subpaths of `@cancjs` packages.

Importing internal files directly (such as `dist/`, `src/`, or undocumented internal modules) bypasses public package export maps. In modern TypeScript and JavaScript packages, internal imports risk pulling dual-package copies into bundle graphs, resulting in fragmented symbol registries and broken brand checks (`isCancelError`, `isCancPromise`).

Always import from the documented public entry points or sanctioned subpaths.

## Public subpath table

The sanctioned public entry points and subpaths for `@cancjs` packages are:

| Package                       | Documented public subpaths                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cancjs/promise`             | root (`@cancjs/promise`)                                                                                                                                                                                |
| `@cancjs/coroutine`           | root (`@cancjs/coroutine`), `/gen`                                                                                                                                                                      |
| `@cancjs/toolbox`             | root (`@cancjs/toolbox`), `/async-iter`                                                                                                                                                                 |
| `@cancjs/toolbox-native`      | root (`@cancjs/toolbox-native`)                                                                                                                                                                         |
| `@cancjs/fetch`               | root (`@cancjs/fetch`)                                                                                                                                                                                  |
| `@cancjs/axios`               | root (`@cancjs/axios`)                                                                                                                                                                                  |
| `@cancjs/decorators`          | root (`@cancjs/decorators`), `/legacy`, `/babel-legacy`                                                                                                                                                 |
| `@cancjs/unhandled-rejection` | root (`@cancjs/unhandled-rejection`), `/register`                                                                                                                                                       |
| `@cancjs/server-express`      | root (`@cancjs/server-express`)                                                                                                                                                                         |
| `@cancjs/server-fastify`      | root (`@cancjs/server-fastify`)                                                                                                                                                                         |
| `@cancjs/server-hono`         | root (`@cancjs/server-hono`)                                                                                                                                                                            |
| `@cancjs/server-koa`          | root (`@cancjs/server-koa`)                                                                                                                                                                             |
| `@cancjs/server-node`         | root (`@cancjs/server-node`)                                                                                                                                                                            |
| `@cancjs/node`                | root (`@cancjs/node`), `/fs`, `/fs/sync`, `/fs/register-graceful`, `/fs/extra`, `/child-process`, `/timers`, `/stream`, `/events`, `/dns`, `/readline`, `/crypto`, `/zlib`, `/worker-threads`, `/dgram` |

Custom package namespaces can be recognized by extending ESLint shared settings via `settings.canc.sources`.

## Rule details

### Incorrect

```ts
// Importing internal dist build directory
import CancelablePromise from '@cancjs/promise/dist/cancelable-promise.js';
```

```ts
// Importing internal source module
import { cancAsync } from '@cancjs/coroutine/src/async.js';
```

```ts
// Importing undocumented subpath
import { execute } from '@cancjs/toolbox/internal/helpers';
```

### Correct

```ts
import CancelablePromise from '@cancjs/promise';
```

```ts
import { cancGenAsync } from '@cancjs/coroutine/gen';
```

```ts
import { readFile } from '@cancjs/node/fs';
```

## Options

This rule does not accept any options. To configure recognized package names, use shared settings:

```json
{
  "settings": {
    "canc": {
      "sources": ["@cancjs/promise", "@cancjs/coroutine", "@my-scope/custom-canc"]
    }
  }
}
```

## When not to use it

If your repository is developing an internal package within a monorepo and intentionally crosses private module boundaries during tests, you can disable this rule.
