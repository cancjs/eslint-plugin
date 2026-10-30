import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import rule from '../../src/rules/no-coroutine-dialect-mismatch.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid08Path = path.join(corpusDir, 'invalid/08-dialect-mismatch-cancawait-in-iter.ts');
const invalid09Path = path.join(corpusDir, 'invalid/09-dialect-mismatch-canciterawait-in-cancasync.ts');
const invalid10Path = path.join(corpusDir, 'invalid/10-dialect-mismatch-cancforawait-in-canciterasync.ts');
const invalid16Path = path.join(corpusDir, 'invalid/16-dialect-mismatch-cancgenforawait-in-cancasync.ts');

const valid06Path = path.join(corpusDir, 'valid/06-dialect-mismatch-canciterawait-in-iter.ts');
const valid07Path = path.join(corpusDir, 'valid/07-dialect-mismatch-cancawait-in-cancasync.ts');
const valid08Path = path.join(corpusDir, 'valid/08-dialect-mismatch-cancforawait-in-cancasync.ts');

const codeInvalid08 = fs.readFileSync(invalid08Path, 'utf8');
const codeInvalid09 = fs.readFileSync(invalid09Path, 'utf8');
const codeInvalid10 = fs.readFileSync(invalid10Path, 'utf8');
const codeInvalid16 = fs.readFileSync(invalid16Path, 'utf8');

const codeValid06 = fs.readFileSync(valid06Path, 'utf8');
const codeValid07 = fs.readFileSync(valid07Path, 'utf8');
const codeValid08 = fs.readFileSync(valid08Path, 'utf8');

const markers08 = readMarkers(invalid08Path);
const markers09 = readMarkers(invalid09Path);
const markers10 = readMarkers(invalid10Path);
const markers16 = readMarkers(invalid16Path);

const tester = ruleTester({ types: false });

describe('no-coroutine-dialect-mismatch', () => {
  tester.run('no-coroutine-dialect-mismatch', rule, {
    valid: [
      codeValid06,
      codeValid07,
      codeValid08,
      // Renamed imports matched correctly
      `import { cancAsync, cancAwait as myAwait } from '@cancjs/coroutine';
       const load = cancAsync(function* () {
         yield* myAwait(Promise.resolve(1));
       });`,
      // cancAwait passed as a value inside iter: not a call, not a yield operand -> silent
      `import { cancGenAsync } from '@cancjs/coroutine/gen';
       import { cancAwait } from '@cancjs/coroutine';
       declare function consume(fn: unknown): void;
       const stream = cancGenAsync(function* () {
         consume(cancAwait);
       });`,
      // Nested coroutines: inner context wins
      `import { cancGenAsync } from '@cancjs/coroutine/gen';
       import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const outer = cancGenAsync(function* () {
         const inner = cancAsync(function* () {
           yield* cancAwait(Promise.resolve(1));
         });
       });`,
      // Delegated helper generator inheriting cancAsync dialect
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       function* helper() {
         yield* cancAwait(Promise.resolve(1));
       }
       const main = cancAsync(function* () {
         yield* helper();
       });`,
      // Loop handle forms in cancAsync: valid
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const src: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(src);
         yield* loop.next();
         yield* cancForAwait.next(loop);
       });`,
      // cancThrow and cancGenThrow in either dialect: runtime-harmless, silent
      `import { cancAsync, cancThrow } from '@cancjs/coroutine';
       import { cancGenAsync, cancGenThrow } from '@cancjs/coroutine/gen';
       const a = cancAsync(function* () {
         yield* cancGenThrow(new Error('gen in canc'));
       });
       const b = cancGenAsync(function* () {
         yield* cancThrow(new Error('canc in gen'));
       });`,
      // Outside coroutine: no context, silent
      `import { cancAwait } from '@cancjs/coroutine';
       import { cancGenAwait } from '@cancjs/coroutine/gen';
       function* plain() {
         yield* cancAwait(Promise.resolve(1));
         yield* cancGenAwait(Promise.resolve(2));
       }`,
    ],
    invalid: [
      {
        code: codeInvalid08,
        errors: [
          {
            messageId: 'cancAwaitInIter' as const,
            line: markers08[0].line,
            data: { helper: 'cancAwait' },
          },
        ],
      },
      {
        code: codeInvalid09,
        errors: [
          {
            messageId: 'iterAwaitInCancAsync' as const,
            line: markers09[0].line,
            data: { helper: 'cancGenAwait' },
          },
        ],
      },
      {
        code: codeInvalid10,
        errors: [
          {
            messageId: 'forAwaitInIter' as const,
            line: markers10[0].line,
            data: { helper: 'cancForAwait' },
          },
        ],
      },
      {
        code: codeInvalid16,
        errors: [
          {
            messageId: 'iterForAwaitInCancAsync' as const,
            line: markers16[0].line,
            data: { helper: 'cancGenForAwait' },
          },
        ],
      },
      // Combinator member form in wrong dialect
      {
        code: `import { cancGenAsync } from '@cancjs/coroutine/gen';
               import { cancAwait } from '@cancjs/coroutine';
               const stream = cancGenAsync(function* () {
                 yield* cancAwait.all([Promise.resolve(1)]);
               });`,
        errors: [
          {
            messageId: 'cancAwaitInIter' as const,
            line: 4,
            data: { helper: 'cancAwait.all' },
          },
        ],
      },
      // cancGenDelegate in cancAsync
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               import { cancGenDelegate } from '@cancjs/coroutine/gen';
               declare const it: Iterable<number>;
               const run = cancAsync(function* () {
                 yield* cancGenDelegate(it);
               });`,
        errors: [
          {
            messageId: 'iterForAwaitInCancAsync' as const,
            line: 5,
            data: { helper: 'cancGenDelegate' },
          },
        ],
      },
    ],
  });
});

describe('no-coroutine-dialect-mismatch factory options', () => {
  tester.run('no-coroutine-dialect-mismatch', rule, {
    valid: [
      // same code without the option: not a coroutine
      `import { cancGenAwait } from '@cancjs/coroutine/gen';
       useX(function* () { yield* cancGenAwait(load()); });`,
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () { yield* cancAwait(load()); });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
      {
        code: `import { cancGenAwait } from '@cancjs/coroutine/gen';
               useStream(function* () { yield* cancGenAwait(load()); });`,
        options: [{ additionalGenCoroutineFactories: ['useStream'] }],
      },
      // replace drops the built-in driver
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               import { cancGenAwait } from '@cancjs/coroutine/gen';
               cancAsync(function* () { yield* cancGenAwait(load()); });`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
      // same name from another source
      {
        code: `import { cancGenAwait } from '@cancjs/coroutine/gen';
               import { useX } from 'other-lib';
               useX(function* () { yield* cancGenAwait(load()); });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
      },
    ],
    invalid: [
      {
        code: `import { cancGenAwait } from '@cancjs/coroutine/gen';
               useX(function* () {
                 yield* cancGenAwait(load());
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'iterAwaitInCancAsync' as const, line: 3, data: { helper: 'cancGenAwait' } }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useStream(function* () {
                 yield* cancAwait(load());
               });`,
        options: [{ additionalGenCoroutineFactories: ['useStream'] }],
        errors: [{ messageId: 'cancAwaitInIter' as const, line: 3, data: { helper: 'cancAwait' } }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               import { cancelableSetup as setup } from '@cancjs/vue';
               setup(function* () {
                 yield* cancAwait(load());
               });`,
        options: [{ additionalGenCoroutineFactories: [{ name: 'cancelableSetup', source: '@cancjs/vue' }] }],
        errors: [{ messageId: 'cancAwaitInIter' as const, line: 4, data: { helper: 'cancAwait' } }],
      },
      // a factory listed in the wrong dialect list reports the mismatch
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               ui.useCancelableEffect(function* () {
                 yield* cancAwait(load());
               });`,
        options: [{ additionalGenCoroutineFactories: ['useCancelableEffect'] }],
        errors: [{ messageId: 'cancAwaitInIter' as const, line: 3, data: { helper: 'cancAwait' } }],
      },
      // the built-in stays on when the other dialect is replaced
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               import { cancGenAwait } from '@cancjs/coroutine/gen';
               cancAsync(function* () {
                 yield* cancGenAwait(load());
               });`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
        errors: [{ messageId: 'iterAwaitInCancAsync' as const, line: 4, data: { helper: 'cancGenAwait' } }],
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
