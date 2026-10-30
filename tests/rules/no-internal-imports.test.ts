import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/no-internal-imports.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/hygiene');

const invalid06Path = path.join(corpusDir, 'invalid/06-no-internal-imports.ts');
const valid06Path = path.join(corpusDir, 'valid/06-no-internal-imports.ts');
const valid11Path = path.join(corpusDir, 'valid/11-no-internal-imports-public-subpaths.ts');

const codeInvalid06 = fs.readFileSync(invalid06Path, 'utf8');
const codeValid06 = fs.readFileSync(valid06Path, 'utf8');
const codeValid11 = fs.readFileSync(valid11Path, 'utf8');

const markers06 = readMarkers(invalid06Path);

const tester = ruleTester();

describe('no-internal-imports', () => {
  tester.run('no-internal-imports', rule, {
    valid: [
      codeValid06,
      codeValid11,
      // Public subpaths under @cancjs/coroutine and @cancjs/toolbox
      "import { cancGenAsync } from '@cancjs/coroutine/gen';",
      "import { createAsyncIterator } from '@cancjs/toolbox/async-iter';",
      // Public subpaths under @cancjs/node
      "import { readFile } from '@cancjs/node/fs';",
      "import { readFileSync } from '@cancjs/node/fs/sync';",
      // User-configured custom source
      {
        code: "import { custom } from '@cancjs/promise/custom-entry';",
        settings: {
          canc: {
            sources: ['@cancjs/promise/custom-entry'],
          },
        },
      },
      // Non-canc package with subpath
      "import get from 'lodash/get';",
    ],
    invalid: [
      // Corpus invalid case
      {
        code: codeInvalid06,
        output: codeInvalid06.replace('@cancjs/promise/dist/cancelable-promise', '@cancjs/promise'),
        errors: [
          {
            messageId: 'internalImport' as const,
            line: markers06[0].line,
            data: {
              source: '@cancjs/promise/dist/cancelable-promise',
              root: '@cancjs/promise',
            },
          },
        ],
      },
      // Autofix on /src/ path
      {
        code: "import { foo } from '@cancjs/promise/src/cancel-error';",
        output: "import { foo } from '@cancjs/promise';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
            data: {
              source: '@cancjs/promise/src/cancel-error',
              root: '@cancjs/promise',
            },
          },
        ],
      },
      // Suggestion (no autofix) on non-dist/src/lib/build path
      {
        code: "import { x } from '@cancjs/coroutine/internal/x';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
            data: {
              source: '@cancjs/coroutine/internal/x',
              root: '@cancjs/coroutine',
            },
            suggestions: [
              {
                messageId: 'suggestRootImport' as const,
                data: {
                  root: '@cancjs/coroutine',
                },
                output: "import { x } from '@cancjs/coroutine';",
              },
            ],
          },
        ],
      },
      // import type
      {
        code: "import type { CancelError } from '@cancjs/promise/lib/cancel-error';",
        output: "import type { CancelError } from '@cancjs/promise';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // require()
      {
        code: "const p = require('@cancjs/promise/dist/cancelable-promise');",
        output: "const p = require('@cancjs/promise');",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // require with destructuring
      {
        code: "const { CancelablePromise } = require('@cancjs/promise/build/index');",
        output: "const { CancelablePromise } = require('@cancjs/promise');",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // dynamic import()
      {
        code: "const mod = await import('@cancjs/promise/dist/cancelable-promise');",
        output: "const mod = await import('@cancjs/promise');",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // export { ... } from
      {
        code: "export { CancelablePromise } from '@cancjs/promise/dist/cancelable-promise';",
        output: "export { CancelablePromise } from '@cancjs/promise';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // export * from
      {
        code: "export * from '@cancjs/promise/dist/cancelable-promise';",
        output: "export * from '@cancjs/promise';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // Side-effect import of deep internal path
      {
        code: "import '@cancjs/promise/dist/cancelable-promise';",
        output: "import '@cancjs/promise';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
          },
        ],
      },
      // Deep path under package that has public subpaths
      {
        code: "import { secret } from '@cancjs/node/internal/secret';",
        errors: [
          {
            messageId: 'internalImport' as const,
            line: 1,
            data: {
              source: '@cancjs/node/internal/secret',
              root: '@cancjs/node',
            },
            suggestions: [
              {
                messageId: 'suggestRootImport' as const,
                data: {
                  root: '@cancjs/node',
                },
                output: "import { secret } from '@cancjs/node';",
              },
            ],
          },
        ],
      },
    ],
  });
});
