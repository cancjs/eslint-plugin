import type { Linter } from 'eslint';

// All entries are "off", so the config is safe when eslint-plugin-promise is not loaded.
export const interopPromise: Linter.Config[] = [
  {
    name: 'canc/interop-promise',
    rules: {
      'promise/prefer-await-to-then': 'off',
      // autofix rewrites any two-argument then chain and changes which errors the catch sees
      'promise/prefer-catch': 'off',
      'promise/prefer-await-to-callbacks': 'off',
      'promise/catch-or-return': 'off',
      'promise/always-return': 'off',
    },
  },
];
