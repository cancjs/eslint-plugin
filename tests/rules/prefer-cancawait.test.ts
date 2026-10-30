import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

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
      // With both dialects imported, the fix uses the cancAsync dialect await
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               import { await as gAwait } from '@cancjs/coroutine/gen';
               const load = cancAsync(function* () {
                 yield Promise.resolve(1);
               });`,
        output: null,
        errors: [{ messageId: 'preferCancAwait' as const, line: 4 }],
      },
      {
        code: `import { await as gAwait } from '@cancjs/coroutine/gen';
               import { cancAsync, await as cAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield Promise.resolve(1);
               });`,
        output: `import { await as gAwait } from '@cancjs/coroutine/gen';
               import { cancAsync, await as cAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 yield* cAwait(Promise.resolve(1));
               });`,
        errors: [{ messageId: 'preferCancAwait' as const, line: 4 }],
      },
      // A configured source that re-exports the coroutine API
      {
        code: `import { cancAsync, cancAwait } from 'my-coroutine';
               const load = cancAsync(function* () {
                 yield Promise.resolve(1);
               });`,
        settings: { canc: { sources: ['my-coroutine'] } },
        output: `import { cancAsync, cancAwait } from 'my-coroutine';
               const load = cancAsync(function* () {
                 yield* cancAwait(Promise.resolve(1));
               });`,
        errors: [{ messageId: 'preferCancAwait' as const, line: 3 }],
      },
      // When cancAwait is shadowed by a local variable, report without fix
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               const load = cancAsync(function* () {
                 const cancAwait = 1;
                 yield Promise.resolve(cancAwait);
               });`,
        output: null,
        errors: [
          {
            messageId: 'preferCancAwait' as const,
            line: 4,
          },
        ],
      },
    ],
  });
});

describe('prefer-cancawait factory options', () => {
  tester.run('prefer-cancawait', rule, {
    valid: [
      // same code without the option: not a coroutine
      `useX(function* () { yield load(); });`,
      // gen dialect emits, so a bare yield is correct
      {
        code: `useStream(function* () { yield 1; });`,
        options: [{ additionalGenCoroutineFactories: ['useStream'] }],
      },
      {
        code: `useX(function* () { yield load(); });`,
        options: [{ additionalCoroutineFactories: ['useX'], allowBareYield: true }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () { yield* cancAwait(load()); });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
      // replace drops the built-in driver
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               cancAsync(function* () { yield load(); });`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
      // same name from another source
      {
        code: `import { useX } from 'other-lib';
               useX(function* () { yield load(); });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
      },
    ],
    invalid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () {
                 yield load();
               });`,
        output: `import { cancAwait } from '@cancjs/coroutine';
               useX(function* () {
                 yield* cancAwait(load());
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'preferCancAwait' as const, line: 3 }],
      },
      {
        code: `import { useX as u } from '@cancjs/react';
               u(function* () {
                 yield load();
               });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
        errors: [{ messageId: 'preferCancAwait' as const, line: 3 }],
      },
      {
        code: `ui.useX(function* () {
                 yield load();
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'preferCancAwait' as const, line: 2 }],
      },
      // the built-in stays on when the other dialect is replaced
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               cancAsync(function* () {
                 yield load();
               });`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
        errors: [{ messageId: 'preferCancAwait' as const, line: 3 }],
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
