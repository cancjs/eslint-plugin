import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/valid-cancasync.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid01Path = path.join(corpusDir, 'invalid/01-valid-cancasync-async-function.ts');
const invalid02Path = path.join(corpusDir, 'invalid/02-valid-cancasync-async-generator.ts');
const invalid03Path = path.join(corpusDir, 'invalid/03-valid-cancasync-any-return.ts');

const valid01Path = path.join(corpusDir, 'valid/01-valid-cancasync.ts');
const valid16Path = path.join(corpusDir, 'valid/16-valid-cancasync-async-result.ts');

const codeInvalid01 = fs.readFileSync(invalid01Path, 'utf8');
const codeInvalid02 = fs.readFileSync(invalid02Path, 'utf8');
const codeInvalid03 = fs.readFileSync(invalid03Path, 'utf8');

const codeValid01 = fs.readFileSync(valid01Path, 'utf8');
const codeValid16 = fs.readFileSync(valid16Path, 'utf8');

const markers01 = readMarkers(invalid01Path);
const markers02 = readMarkers(invalid02Path);
const markers03 = readMarkers(invalid03Path);

const tester = ruleTester({ types: false });

describe('valid-cancasync', () => {
  tester.run('valid-cancasync', rule, {
    valid: [
      codeValid01,
      codeValid16,
      `import { cancAsync } from '@cancjs/coroutine';
       const load = cancAsync(function* () { yield 1; });`,
      `import { cancGenAsync } from '@cancjs/coroutine/gen';
       const load = cancGenAsync(function* () { yield 1; });`,
      `import { cancGenAsync } from '@cancjs/coroutine/gen';
       type AsyncGenResult<T> = Generator<unknown, T, unknown>;
       const load = cancGenAsync(function* (): AsyncGenResult<number> { return 1; });`,
      `import { cancAsync } from '@cancjs/coroutine';
       const load = cancAsync(function* (): Generator<string, number, boolean> { return 1; });`,
      `async function plainAsync() {}`,
      `function* plainGen(): any {}`,
      `import { cancAsync } from '@cancjs/coroutine';
       cancAsync(123 as any);`,
    ],
    invalid: [
      {
        code: codeInvalid01,
        errors: [
          {
            messageId: 'asyncFunction' as const,
            line: markers01[0].line,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      {
        code: codeInvalid02,
        errors: [
          {
            messageId: 'asyncGenerator' as const,
            line: markers02[0].line,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      {
        code: codeInvalid03,
        errors: [
          {
            messageId: 'anyReturnAnnotation' as const,
            line: markers03[0].line,
          },
        ],
      },
      {
        code: `import { cancGenAsync } from '@cancjs/coroutine/gen';
               const load = cancGenAsync(async function () {});`,
        errors: [
          {
            messageId: 'asyncFunction' as const,
            line: 2,
            data: { driver: 'cancGenAsync', await: 'cancGenAwait' },
          },
        ],
      },
      {
        code: `import { cancGenAsync } from '@cancjs/coroutine/gen';
               const load = cancGenAsync(async function* () {});`,
        errors: [
          {
            messageId: 'asyncGenerator' as const,
            line: 2,
            data: { driver: 'cancGenAsync', await: 'cancGenAwait' },
          },
        ],
      },
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(function* (): Generator<unknown, number, any> {});`,
        errors: [
          {
            messageId: 'anyReturnAnnotation' as const,
            line: 2,
          },
        ],
      },
      // Plain sync arrow function
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(() => 42);`,
        errors: [
          {
            messageId: 'asyncFunction' as const,
            line: 2,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      // Identifier-passed generator with any return
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               function* g(): any {}
               cancAsync(g);`,
        errors: [
          {
            messageId: 'anyReturnAnnotation' as const,
            line: 2,
          },
        ],
      },
      // Identifier-passed plain async function
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               async function fn() {}
               cancAsync(fn);`,
        errors: [
          {
            messageId: 'asyncFunction' as const,
            line: 3,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      // Qualified Generator with any in TNext slot
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(function* (): ns.Generator<unknown, number, any> {});`,
        errors: [
          {
            messageId: 'anyReturnAnnotation' as const,
            line: 2,
          },
        ],
      },
      // 1-arg Generator<any>
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(function* (): Generator<any> {});`,
        errors: [
          {
            messageId: 'anyReturnAnnotation' as const,
            line: 2,
          },
        ],
      },
    ],
  });
});
