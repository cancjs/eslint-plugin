import type { Linter } from 'eslint';

// load typescript-eslint first, ESLint rejects "error" entries for unknown plugins
export const interopTypescriptEslint: Linter.Config[] = [
  {
    name: 'canc/interop-typescript-eslint',
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      '@typescript-eslint/no-misused-promises': 'error',
      // autofix rewraps the return in a native promise and drops cancelability
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
    },
  },
];
