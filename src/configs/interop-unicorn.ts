import type { Linter } from 'eslint';

export const interopUnicorn: Linter.Config[] = [
  {
    name: 'canc/interop-unicorn',
    rules: { 'unicorn/prefer-top-level-await': 'off' },
  },
];
