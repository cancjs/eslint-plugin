import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import rule from '../../src/rules/no-cancellation-gap.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid12Path = path.join(corpusDir, 'invalid/12-no-cancellation-gap-coroutine.ts');
const invalid13Path = path.join(corpusDir, 'invalid/13-no-cancellation-gap-chain.ts');

const valid10Path = path.join(corpusDir, 'valid/10-no-cancellation-gap-closed.ts');
const valid11Path = path.join(corpusDir, 'valid/11-no-cancellation-gap-acknowledged.ts');
const valid15Path = path.join(corpusDir, 'valid/15-no-cancellation-gap-adopted-cancelable.ts');

const codeInvalid12 = fs.readFileSync(invalid12Path, 'utf8');
const codeInvalid13 = fs.readFileSync(invalid13Path, 'utf8');

const codeValid10 = fs.readFileSync(valid10Path, 'utf8');
const codeValid11 = fs.readFileSync(valid11Path, 'utf8');
const codeValid15 = fs.readFileSync(valid15Path, 'utf8');

const markers12 = readMarkers(invalid12Path);
const markers13 = readMarkers(invalid13Path);

const untypedTester = ruleTester({ types: false });
const typedTester = ruleTester({ types: true });

describe('no-cancellation-gap (untyped lane: silent)', () => {
  untypedTester.run('no-cancellation-gap-untyped', rule, {
    valid: [
      codeValid10,
      codeValid11,
      codeValid15,
      // Without types, invalid cases must produce zero messages
      codeInvalid12,
      codeInvalid13,
      `import CancelablePromise from '@cancjs/promise';
       declare function legacy(): Promise<void>;
       const chain = CancelablePromise.resolve().then(() => legacy());`,
    ],
    invalid: [],
  });
});

describe('no-cancellation-gap (typed lane)', () => {
  typedTester.run('no-cancellation-gap', rule, {
    valid: [
      codeValid10,
      codeValid11.replaceAll('canc/no-cancellation-gap', '@rule-tester/no-cancellation-gap'),
      codeValid15,
      // Union operand (CancelablePromise | Promise) is valid: cancel reaches it
      `import CancelablePromise from '@cancjs/promise';
       import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchUnion(): CancelablePromise<number> | Promise<number>;
       const run = cancAsync(function* () {
         yield* cancAwait(fetchUnion());
       });`,
      // Values and non-thenables are valid
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* () {
         yield 42;
         yield* cancAwait(Promise.resolve(42) as any);
       });`,
      // A handler returning a CancelablePromise is valid (adopted cancelable)
      `import CancelablePromise from '@cancjs/promise';
       declare function task(): CancelablePromise<number>;
       declare function cancelable(): CancelablePromise<string>;
       task().then(() => cancelable());`,
      // Non-cancelable chain: plain Promise chain is not tracked
      `declare function legacy1(): Promise<number>;
       declare function legacy2(): Promise<string>;
       legacy1().then(() => legacy2());`,
      // cancAwait.all with cancelable promises is valid
      `import CancelablePromise from '@cancjs/promise';
       import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function task(): CancelablePromise<void>;
       const run = cancAsync(function* () {
         yield* cancAwait.all([task(), task()]);
       });`,
      // cancGenAsync with cancGenAwait and cancelable promise is valid
      `import CancelablePromise from '@cancjs/promise';
       import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
       declare function task(): CancelablePromise<void>;
       const run = cancGenAsync(function* () {
         yield* cancGenAwait(task());
       });`,
    ],
    invalid: [
      {
        code: codeInvalid12,
        errors: [
          {
            messageId: 'gapStep' as const,
            line: markers12[0].line,
          },
        ],
      },
      {
        code: codeInvalid13,
        errors: [
          {
            messageId: 'gapChainStep' as const,
            line: markers13[0].line,
          },
        ],
      },
      // cancAwait.all with a plain promise element
      {
        code: `import CancelablePromise from '@cancjs/promise';
               import { cancAsync, cancAwait } from '@cancjs/coroutine';
               declare function task(): CancelablePromise<void>;
               declare function legacy(): Promise<void>;
               const run = cancAsync(function* () {
                 yield* cancAwait.all([task(), legacy()]);
               });`,
        errors: [
          {
            messageId: 'gapStep' as const,
            line: 6,
          },
        ],
      },
      // Bare yield of plain promise in cancAsync
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               declare function legacy(): Promise<void>;
               const run = cancAsync(function* () {
                 yield legacy();
               });`,
        errors: [
          {
            messageId: 'gapStep' as const,
            line: 4,
          },
        ],
      },
      // .catch returning plain promise
      {
        code: `import CancelablePromise from '@cancjs/promise';
               declare function task(): CancelablePromise<void>;
               declare function legacy(): Promise<void>;
               task().catch((err) => legacy());`,
        errors: [
          {
            messageId: 'gapChainStep' as const,
            line: 4,
          },
        ],
      },
      // .finally returning plain promise
      {
        code: `import CancelablePromise from '@cancjs/promise';
               declare function task(): CancelablePromise<void>;
               declare function legacy(): Promise<void>;
               task().finally(() => legacy());`,
        errors: [
          {
            messageId: 'gapChainStep' as const,
            line: 4,
          },
        ],
      },
    ],
  });
});

describe('no-cancellation-gap factory options', () => {
  typedTester.run('no-cancellation-gap factory', rule, {
    valid: [
      // same code without the option: not a coroutine
      `declare function legacyPlain(): Promise<void>;
       import { cancAwait } from '@cancjs/coroutine';
       useX(function* () {
         yield* cancAwait(legacyPlain());
       });`,
      {
        code: `import CancelablePromise from '@cancjs/promise';
               import { cancAwait } from '@cancjs/coroutine';
               declare function task(): CancelablePromise<void>;
               useX(function* () {
                 yield* cancAwait(task());
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
      // replace drops the built-in driver
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               declare function legacyPlain(): Promise<void>;
               cancAsync(function* () {
                 yield* cancAwait(legacyPlain());
               });`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
      // same name from another source
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               import { useX } from 'other-lib';
               declare function legacyPlain(): Promise<void>;
               useX(function* () {
                 yield* cancAwait(legacyPlain());
               });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
      },
    ],
    invalid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               declare function legacyPlain(): Promise<void>;
               useX(function* () {
                 yield* cancAwait(legacyPlain());
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'gapStep' as const, line: 4 }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               import { useX as u } from '@cancjs/react';
               declare function legacyPlain(): Promise<void>;
               u(function* () {
                 yield* cancAwait(legacyPlain());
               });`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
        errors: [{ messageId: 'gapStep' as const, line: 5 }],
      },
      {
        code: `import { cancGenAwait } from '@cancjs/coroutine/gen';
               declare function legacyPlain(): Promise<void>;
               ui.setup(function* () {
                 yield* cancGenAwait(legacyPlain());
               });`,
        options: [{ additionalGenCoroutineFactories: ['setup'] }],
        errors: [{ messageId: 'gapStep' as const, line: 4 }],
      },
      // the built-in stays on when the other dialect is replaced
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               declare function legacyPlain(): Promise<void>;
               cancAsync(function* () {
                 yield* cancAwait(legacyPlain());
               });`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
        errors: [{ messageId: 'gapStep' as const, line: 4 }],
      },
    ],
  });

  untypedTester.run('no-cancellation-gap factory (untyped)', rule, {
    valid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
               declare function legacyPlain(): Promise<void>;
               useX(function* () {
                 yield* cancAwait(legacyPlain());
               });`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
    ],
    invalid: [],
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
