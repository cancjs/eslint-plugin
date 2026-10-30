import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import rule from '../../src/rules/no-unstarred-cancawait.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid04Path = path.join(corpusDir, 'invalid/04-no-unstarred-cancawait-missing-star.ts');
const invalid05Path = path.join(corpusDir, 'invalid/05-no-unstarred-cancawait-unused.ts');
const valid02Path = path.join(corpusDir, 'valid/02-no-unstarred-cancawait.ts');

const codeInvalid04 = fs.readFileSync(invalid04Path, 'utf8');
const codeInvalid05 = fs.readFileSync(invalid05Path, 'utf8');
const codeValid02 = fs.readFileSync(valid02Path, 'utf8');

const markers04 = readMarkers(invalid04Path);
const markers05 = readMarkers(invalid05Path);

const tester = ruleTester({ types: false });

describe('no-unstarred-cancawait', () => {
  tester.run('no-unstarred-cancawait', rule, {
    valid: [
      codeValid02,
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const load = cancAsync(function* () {
         const res = yield* cancAwait(Promise.resolve(1));
         return res;
       });`,
      `import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
       const load = cancGenAsync(function* () {
         const res = yield* cancGenAwait(Promise.resolve(1));
         return res;
       });`,
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const load = cancAsync(function* () {
         yield* cancAwait.all([Promise.resolve(1)]);
       });`,
      // Outside coroutine: no context, silent
      `import { cancAwait } from '@cancjs/coroutine';
       function* plain() {
         yield cancAwait(Promise.resolve(1));
       }`,
    ],
    invalid: [
      {
        code: codeInvalid04,
        output: codeInvalid04.replace('yield cancAwait', 'yield* cancAwait'),
        errors: [
          {
            messageId: 'missingStar' as const,
            line: markers04[0].line,
            data: { await: 'cancAwait' },
          },
        ],
      },
      {
        code: codeInvalid05,
        errors: [
          {
            messageId: 'unusedCancAwait' as const,
            line: markers05[0].line,
            data: { await: 'cancAwait' },
          },
        ],
      },
      {
        code: `import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
               const load = cancGenAsync(function* () {
                 yield cancGenAwait(Promise.resolve(1));
               });`,
        output: `import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
               const load = cancGenAsync(function* () {
                 yield* cancGenAwait(Promise.resolve(1));
               });`,
        errors: [
          {
            messageId: 'missingStar' as const,
            line: 3,
            data: { await: 'cancGenAwait' },
          },
        ],
      },
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield cancAwait.all([Promise.resolve(1)]);
               });`,
        output: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield* cancAwait.all([Promise.resolve(1)]);
               });`,
        errors: [
          {
            messageId: 'missingStar' as const,
            line: 3,
            data: { await: 'cancAwait.all' },
          },
        ],
      },
      {
        code: `import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
               const load = cancGenAsync(function* () {
                 cancGenAwait(Promise.resolve(1));
               });`,
        errors: [
          {
            messageId: 'unusedCancAwait' as const,
            line: 3,
            data: { await: 'cancGenAwait' },
          },
        ],
      },
    ],
  });
});

describe('no-unstarred-cancawait factory options', () => {
  tester.run('no-unstarred-cancawait', rule, {
    valid: [
      // same code without the option: not a coroutine
      `import { cancAwait } from '@cancjs/coroutine';
       useX(function* () { yield cancAwait(Promise.resolve(1)); });`,
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () { yield* cancAwait(Promise.resolve(1)); });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
      // async callback is not a coroutine body
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(async () => { cancAwait(Promise.resolve(1)); });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
      // replace drops the built-in driver
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               cancAsync(function* () { yield cancAwait(Promise.resolve(1)); });`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
      // same name from another source
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               import { useX } from 'other-lib';
               useX(function* () { yield cancAwait(Promise.resolve(1)); });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
      },
    ],
    invalid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () {
                 yield cancAwait(Promise.resolve(1));
               });`,
        output: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () {
                 yield* cancAwait(Promise.resolve(1));
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'missingStar' as const, line: 3, data: { await: 'cancAwait' } }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               import { useX as u } from '@cancjs/react';
               u(function* () {
                 yield cancAwait(Promise.resolve(1));
               });`,
        output: `import { cancAwait } from '@cancjs/coroutine';
               import { useX as u } from '@cancjs/react';
               u(function* () {
                 yield* cancAwait(Promise.resolve(1));
               });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
        errors: [{ messageId: 'missingStar' as const, line: 4, data: { await: 'cancAwait' } }],
      },
      {
        code: `import { cancGenAwait } from '@cancjs/coroutine/gen';
               ui.setup(function* () {
                 yield cancGenAwait(Promise.resolve(1));
               });`,
        output: `import { cancGenAwait } from '@cancjs/coroutine/gen';
               ui.setup(function* () {
                 yield* cancGenAwait(Promise.resolve(1));
               });`,
        options: [{ additionalGenCoroutineFactories: ['setup'] }],
        errors: [{ messageId: 'missingStar' as const, line: 3, data: { await: 'cancGenAwait' } }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () {
                 cancAwait(Promise.resolve(1));
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'unusedCancAwait' as const, line: 3, data: { await: 'cancAwait' } }],
      },
      // the built-in stays on when the other dialect is replaced
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               cancAsync(function* () {
                 yield cancAwait(Promise.resolve(1));
               });`,
        output: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               cancAsync(function* () {
                 yield* cancAwait(Promise.resolve(1));
               });`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
        errors: [{ messageId: 'missingStar' as const, line: 3, data: { await: 'cancAwait' } }],
      },
    ],
  });

  it('rejects add and replace of one dialect together', () => {
    const linter = new Linter({ configType: 'flat' });
    const verify = (options: object) =>
      linter.verify('', [
        { plugins: { canc: { rules: { r: rule as never } } }, rules: { 'canc/r': ['error', options] } },
      ]);
    expect(() => verify({ additionalCoroutineFactories: ['a'], coroutineFactories: ['b'] })).toThrow(
      /should NOT be valid/,
    );
    expect(() => verify({ additionalGenCoroutineFactories: ['a'], genCoroutineFactories: ['b'] })).toThrow(
      /should NOT be valid/,
    );
    expect(() => verify({ additionalCoroutineFactories: ['a'], genCoroutineFactories: ['b'] })).not.toThrow();
  });
});
