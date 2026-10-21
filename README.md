# @cancjs/eslint-plugin

ESLint plugin for `@cancjs/*`.

## Rules

| Rule                                                                                | Description                                                                   | Tier                |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| [`canc/executor-cancel-wiring`](docs/rules/executor-cancel-wiring.md)               | Require cancel wiring in promise executors                                    | strict              |
| [`canc/executor-param-names`](docs/rules/executor-param-names.md)                   | Enforce standardized parameter names in promise executors                     | stylistic           |
| [`canc/handle-cancel-first`](docs/rules/handle-cancel-first.md)                     | Ensure cancel handlers are registered synchronously at the start of executors | recommended         |
| [`canc/no-async-executor`](docs/rules/no-async-executor.md)                         | Disallow async functions as promise executors                                 | recommended         |
| [`canc/no-executor-return`](docs/rules/no-executor-return.md)                       | Disallow returning values from promise executors                              | recommended         |
| [`canc/no-multistep-executor`](docs/rules/no-multistep-executor.md)                 | Disallow starting multiple async operations in one executor                   | recommended         |
| [`canc/no-transform-in-executor`](docs/rules/no-transform-in-executor.md)           | Disallow transforming data before resolving in executor                       | stylistic           |
| [`canc/prefer-signal-over-controller`](docs/rules/prefer-signal-over-controller.md) | Prefer passing AbortSignal rather than whole AbortController                  | recommended, strict |
| [`canc/require-signal-forwarding`](docs/rules/require-signal-forwarding.md)         | Require forwarding controller signal when cancel handler aborts it            | recommended         |
| [`canc/valid-canc-params`](docs/rules/valid-canc-params.md)                         | Enforce valid argument count and shapes for cancellable promise methods       | recommended         |
