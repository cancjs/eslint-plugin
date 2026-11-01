import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

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
const typedTester = ruleTester();

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
      `import { cancAsync } from '@cancjs/coroutine';
       declare function g(): number;
       cancAsync(g);`,
      `function* plainGen(): any {}`,
      `import { cancAsync } from '@cancjs/coroutine';
       cancAsync(123 as any);`,
      // any in the yield slot only leaves TNext at its default
      `import { cancAsync } from '@cancjs/coroutine';
       const load = cancAsync(function* (): Generator<any> {});`,
      `import { cancAsync } from '@cancjs/coroutine';
       const load = cancAsync(function* (): Generator<any, number> { return 1; });`,
      // parameter of a function declaration is not the enclosing function
      `import { cancAsync } from '@cancjs/coroutine';
       function wrap(genFn) { return cancAsync(genFn); }`,
      `import { cancAsync } from '@cancjs/coroutine';
       const wrap = (genFn) => cancAsync(genFn);`,
      `import { cancAsync } from '@cancjs/coroutine';
       class Runner { run(genFn) { return cancAsync(genFn); } }`,
      // sync function returning a generator object
      `import { cancAsync } from '@cancjs/coroutine';
       function* steps() { yield 1; }
       const load = cancAsync(() => steps());`,
      // untyped lane cannot prove a sync function wrong
      `import { cancAsync } from '@cancjs/coroutine';
       const load = cancAsync(() => 42);`,
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
      // 2-arg Generator<void, any>
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(function* (): Generator<void, any> {});`,
        errors: [
          {
            messageId: 'anyReturnAnnotation' as const,
            line: 2,
          },
        ],
      },
    ],
  });

  typedTester.run('valid-cancasync (typed)', rule, {
    valid: [
      `import { cancAsync } from '@cancjs/coroutine';
       function* steps(): Generator<number, void, unknown> { yield 1; }
       const load = cancAsync(() => steps());`,
      `import { cancAsync } from '@cancjs/coroutine';
       declare function anything(): any;
       const load = cancAsync(() => anything());`,
      `import { cancAsync } from '@cancjs/coroutine';
       function wrap(genFn: () => Generator<unknown, number, unknown>) { return cancAsync(genFn); }`,
      // a never-returning function proves nothing about the iterator
      `import { cancAsync } from '@cancjs/coroutine';
       function fail(): never { throw new Error('x'); }
       cancAsync(fail);`,
      `import { cancAsync } from '@cancjs/coroutine';
       declare function g(): Generator<never, number, unknown>;
       cancAsync(g);`,
    ],
    invalid: [
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const load = cancAsync(() => 42);`,
        errors: [
          {
            messageId: 'syncFunction' as const,
            line: 2,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               function load(): string { return 'x'; }
               cancAsync(load);`,
        errors: [
          {
            messageId: 'syncFunction' as const,
            line: 3,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               declare function g(): number;
               cancAsync(g);`,
        errors: [
          {
            messageId: 'syncFunction' as const,
            line: 3,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
    ],
  });
});

describe('valid-cancasync factory options', () => {
  tester.run('valid-cancasync', rule, {
    valid: [
      // overload: a configured factory may take an async callback
      {
        code: `const stop = useCancelableEffect(async () => {}, []);`,
        options: [{ additionalCoroutineFactories: ['useCancelableEffect'] }],
      },
      // same code, no option
      `function* body(): any {}
       useCancelableEffect(body, []);`,
      // plain generator without annotation
      {
        code: `useCancelableEffect(function* () { yield 1; }, []);`,
        options: [{ additionalCoroutineFactories: ['useCancelableEffect'] }],
      },
      // replace drops the built-in driver
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               cancAsync(async () => {});`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
      // other dialect replace keeps the built-in cancAsync
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               cancAsync(function* () {});`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
      },
      // a different source is not the configured factory
      {
        code: `import { cancelableSetup } from 'other-lib';
               cancelableSetup(function* (): any {});`,
        options: [
          {
            additionalGenCoroutineFactories: [{ name: 'cancelableSetup', source: '@cancjs/vue' }],
          },
        ],
      },
    ],
    invalid: [
      {
        code: `useCancelableEffect(function* (): any {}, []);`,
        options: [{ additionalCoroutineFactories: ['useCancelableEffect'] }],
        errors: [{ messageId: 'anyReturnAnnotation' as const, line: 1 }],
      },
      {
        code: `ui.useCancelableEffect(function* (): Generator<any, any, any> {}, []);`,
        options: [{ additionalCoroutineFactories: ['useCancelableEffect'] }],
        errors: [{ messageId: 'anyReturnAnnotation' as const, line: 1 }],
      },
      {
        code: `import { cancelableSetup as setup } from '@cancjs/vue';
               setup(function* (): any {});`,
        options: [
          {
            additionalGenCoroutineFactories: [{ name: 'cancelableSetup', source: '@cancjs/vue' }],
          },
        ],
        errors: [{ messageId: 'anyReturnAnnotation' as const, line: 2 }],
      },
      // built-in keeps every check when extended
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               cancAsync(async () => {});`,
        options: [{ additionalCoroutineFactories: ['useCancelableEffect'] }],
        errors: [
          {
            messageId: 'asyncFunction' as const,
            line: 2,
            data: { driver: 'cancAsync', await: 'cancAwait' },
          },
        ],
      },
      // gen-list factory: the built-in cancAsync still reports its own kind
      {
        code: `import { cancGenAsync } from '@cancjs/coroutine/gen';
               cancGenAsync(async () => {});`,
        options: [{ coroutineFactories: ['onlyMine'] }],
        errors: [
          {
            messageId: 'asyncFunction' as const,
            line: 2,
            data: { driver: 'cancGenAsync', await: 'cancGenAwait' },
          },
        ],
      },
    ],
  });

  it('rejects add and replace of one dialect together', () => {
    const linter = new Linter({ configType: 'flat' });
    const verify = (options: object) =>
      linter.verify('', [
        {
          plugins: { canc: { rules: { r: rule as never } } },
          rules: { 'canc/r': ['error', options] },
        },
      ]);
    expect(() =>
      verify({
        additionalCoroutineFactories: ['a'],
        coroutineFactories: ['b'],
      }),
    ).toThrow(/should NOT be valid/);
    expect(() =>
      verify({
        additionalGenCoroutineFactories: ['a'],
        genCoroutineFactories: ['b'],
      }),
    ).toThrow(/should NOT be valid/);
    expect(() =>
      verify({
        additionalCoroutineFactories: ['a'],
        genCoroutineFactories: ['b'],
      }),
    ).not.toThrow();
  });
});
