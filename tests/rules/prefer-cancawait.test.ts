import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/prefer-cancawait.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid06Path = path.join(corpusDir, 'invalid/06-prefer-cancawait-bare-yield.ts');
const valid03Path = path.join(corpusDir, 'valid/03-prefer-cancawait-typed-step.ts');
const valid04Path = path.join(corpusDir, 'valid/04-prefer-cancawait-all-tuple.ts');
const valid05Path = path.join(corpusDir, 'valid/05-prefer-cancawait-delegation.ts');

const codeInvalid06 = fs.readFileSync(invalid06Path, 'utf8');
const codeValid03 = fs.readFileSync(valid03Path, 'utf8');
const codeValid04 = fs.readFileSync(valid04Path, 'utf8');
const codeValid05 = fs.readFileSync(valid05Path, 'utf8');

const markers06 = readMarkers(invalid06Path);

const tester = ruleTester({ types: false });

describe('prefer-cancawait', () => {
  tester.run('prefer-cancawait', rule, {
    valid: [
      codeValid03,
      codeValid04,
      codeValid05,
      // cancGenAsync bare yield x is an emit, valid
      `import { cancGenAsync } from '@cancjs/coroutine/gen';
       const load = cancGenAsync(function* () {
         yield 1;
       });`,
      // Bare yield with no argument is a manual checkpoint, valid
      `import { cancAsync } from '@cancjs/coroutine';
       const load = cancAsync(function* () {
         yield;
       });`,
      // allowBareYield option allows bare yield
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield Promise.resolve(1);
               });`,
        options: [{ allowBareYield: true }],
      },
      // Tracked cancAwait call handled by no-unstarred-cancawait, silent here
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const load = cancAsync(function* () {
         yield cancAwait(Promise.resolve(1));
       });`,
      // Outside coroutine
      `function* plain() {
         yield Promise.resolve(1);
       }`,
    ],
    invalid: [
      {
        code: codeInvalid06,
        output: codeInvalid06.replace(
          'const user = yield fetchUserCancelable();',
          'const user = yield* cancAwait(fetchUserCancelable());',
        ),
        errors: [
          {
            messageId: 'preferCancAwait' as const,
            line: markers06[0].line,
          },
        ],
      },
      // When cancAwait is not in scope, report without fix
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield Promise.resolve(1);
               });`,
        output: null,
        errors: [
          {
            messageId: 'preferCancAwait' as const,
            line: 3,
          },
        ],
      },
      // When cancAwait is renamed, fix uses the local renamed binding
      {
        code: `import { cancAsync, cancAwait as myAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield Promise.resolve(1);
               });`,
        output: `import { cancAsync, cancAwait as myAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield* myAwait(Promise.resolve(1));
               });`,
        errors: [
          {
            messageId: 'preferCancAwait' as const,
            line: 3,
          },
        ],
      },
    ],
  });
});
