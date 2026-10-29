import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

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
