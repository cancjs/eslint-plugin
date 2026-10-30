import promise from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

import canc from '../../../dist/index.mjs';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, unicorn },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/return-await': 'error',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      'unicorn/prefer-top-level-await': 'error',
      'unicorn/no-thenable': 'error',
    },
  },
  promise.configs['flat/recommended'],
  {
    rules: {
      'promise/prefer-await-to-then': 'error',
      'promise/prefer-catch': 'error',
      'promise/prefer-await-to-callbacks': 'error',
      'promise/catch-or-return': 'error',
      'promise/always-return': 'error',
      'promise/no-multiple-resolved': 'error',
    },
  },
  ...canc.configs.recommended,
  ...canc.configs.interopTypescriptEslint,
  ...canc.configs.interopPromise,
  ...canc.configs.interopUnicorn,
];
