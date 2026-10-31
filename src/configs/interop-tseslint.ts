import type { Linter } from 'eslint';

// load typescript-eslint first, ESLint rejects "error" entries for unknown plugins
export const interopTypescriptEslint: Linter.Config[] = [
  {
    name: 'canc/interop-typescript-eslint',
    rules: {
      // handleCancel returns its promise only for chaining
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          checkThenables: true,
          allowForKnownSafeCalls: [{ from: 'package', package: '@cancjs/promise', name: ['handleCancel'] }],
        },
      ],
      '@typescript-eslint/no-misused-promises': 'error',
      // autofix rewraps the return in a native promise and drops cancelability
      '@typescript-eslint/promise-function-async': 'off',
      // keeps a cancellation catchable inside try, drops the stylistic report outside it
      '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
    },
  },
];
