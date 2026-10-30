import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/must-consume-lazy.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/lazy');

const invalid01Path = path.join(corpusDir, 'invalid/01-must-consume-lazy-dropped.ts');
const invalid02Path = path.join(corpusDir, 'invalid/02-must-consume-lazy-local-unused.ts');
const invalid05Path = path.join(corpusDir, 'invalid/05-must-consume-lazy-try-dropped.ts');
const invalid06Path = path.join(corpusDir, 'invalid/06-must-consume-lazy-factories-dropped.ts');
const invalid07Path = path.join(corpusDir, 'invalid/07-must-consume-lazy-void.ts');

const valid01Path = path.join(corpusDir, 'valid/01-must-consume-lazy-consumed-later.ts');
const valid02Path = path.join(corpusDir, 'valid/02-must-consume-lazy-returned.ts');
const valid05Path = path.join(corpusDir, 'valid/05-must-consume-lazy-execute.ts');
const valid06Path = path.join(corpusDir, 'valid/06-must-consume-lazy-toolbox-native.ts');

const codeInvalid01 = fs.readFileSync(invalid01Path, 'utf8');
const codeInvalid02 = fs.readFileSync(invalid02Path, 'utf8');
const codeInvalid05 = fs.readFileSync(invalid05Path, 'utf8');
const codeInvalid06 = fs.readFileSync(invalid06Path, 'utf8');
const codeInvalid07 = fs.readFileSync(invalid07Path, 'utf8');

const codeValid01 = fs.readFileSync(valid01Path, 'utf8');
const codeValid02 = fs.readFileSync(valid02Path, 'utf8');
const codeValid05 = fs.readFileSync(valid05Path, 'utf8');
const codeValid06 = fs.readFileSync(valid06Path, 'utf8');

const markers01 = readMarkers(invalid01Path);
const markers02 = readMarkers(invalid02Path);
const markers05 = readMarkers(invalid05Path);
const markers06 = readMarkers(invalid06Path);
const markers07 = readMarkers(invalid07Path);

const untypedTester = ruleTester({ types: false });
const typedTester = ruleTester({ types: true });

describe('must-consume-lazy (untyped)', () => {
  untypedTester.run('must-consume-lazy', rule, {
    valid: [
      codeValid01,
      codeValid02,
      codeValid05,
      codeValid06,
      `import { LazyPromise } from '@cancjs/toolbox';
       LazyPromise.try(() => 1).execute();`,
      `import { LazyPromise } from '@cancjs/toolbox';
       export const p = new LazyPromise((resolve) => resolve(1));`,
      `class LazyPromise {}
       new LazyPromise();`,
      `import { LazyPromise } from '@cancjs/toolbox';
       const { promise } = LazyPromise.withResolvers();
       promise.execute();`,
      `import { LazyPromise } from '@cancjs/toolbox';
       function test() {
         const { resolve, ...rest } = LazyPromise.withResolvers<number>();
         resolve(1);
       }`,
      `import { LazyPromise } from '@cancjs/toolbox';
       function test(fallback: LazyPromise<number>) {
         const { promise = fallback, resolve } = LazyPromise.withResolvers<number>();
         resolve(1);
       }`,
      `import { LazyPromise } from '@cancjs/toolbox';
       function test() {
         const wr = LazyPromise.withResolvers<number>();
         wr.resolve(1);
         return wr.promise;
       }`,
      // Type-only creator without parser services degrades silently
      `declare function getLazy(): any;
       getLazy();`,
    ],
    invalid: [
      {
        code: codeInvalid01,
        errors: [
          {
            messageId: 'unusedLazy' as const,
            line: markers01[0].line,
          },
        ],
      },
      {
        code: codeInvalid02,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: markers02[0].line,
            data: { name: 'warmup' },
          },
        ],
      },
      {
        code: codeInvalid05,
        errors: [
          {
            messageId: 'unusedLazy' as const,
            line: markers05[0].line,
          },
        ],
      },
      {
        code: codeInvalid06,
        errors: [
          {
            messageId: 'unusedLazy' as const,
            line: markers06[0].line,
          },
        ],
      },
      {
        code: codeInvalid07,
        errors: [
          {
            messageId: 'unusedLazy' as const,
            line: markers07[0].line,
          },
        ],
      },
      // withResolvers unused promise
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               function test() {
                 const { promise, resolve } = LazyPromise.withResolvers<number>();
               }`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 3,
            data: { name: 'promise' },
          },
        ],
      },
      // withResolvers has no lazy member: a lazy key is not the lazy promise
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               function test() {
                 const { lazy, resolve } = LazyPromise.withResolvers<number>();
                 lazy.execute();
               }`,
        errors: [{ messageId: 'unusedLazy' as const, line: 3 }],
      },
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               function test(fallback: LazyPromise<number>) {
                 const { lazy = fallback } = LazyPromise.withResolvers<number>();
               }`,
        errors: [{ messageId: 'unusedLazy' as const, line: 3 }],
      },
      // withResolvers with literal 'promise' key
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               function test() {
                 const { 'promise': customLazy } = LazyPromise.withResolvers<number>();
               }`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 3,
            data: { name: 'customLazy' },
          },
        ],
      },
      // void with TS assertion does not consume
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               function test() {
                 const p = LazyPromise.resolve(42);
                 void (p as any);
               }`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 3,
            data: { name: 'p' },
          },
        ],
      },
      // top-level module-scope unused variable
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
const unused = LazyPromise.try(() => 1);`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 2,
            data: { name: 'unused' },
          },
        ],
      },
      // withResolvers unused promise
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
function test() {
  const { promise, resolve } = LazyPromise.withResolvers<number>();
}`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 3,
            data: { name: 'promise' },
          },
        ],
      },
      // withResolvers unaccessed result variable
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
function test() {
  const r = LazyPromise.withResolvers<number>();
}`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 3,
            data: { name: 'r' },
          },
        ],
      },
      // resolver methods called but promise/lazy never read
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
function test() {
  const wr = LazyPromise.withResolvers<number>();
  wr.resolve(1);
}`,
        errors: [
          {
            messageId: 'unusedLazyVar' as const,
            line: 3,
            data: { name: 'wr' },
          },
        ],
      },
      // withResolvers omitting promise/lazy entirely
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
function test() {
  const { resolve, reject } = LazyPromise.withResolvers<number>();
  resolve(1);
}`,
        errors: [
          {
            messageId: 'unusedLazy' as const,
            line: 3,
          },
        ],
      },
    ],
  });
});

describe('must-consume-lazy (typed lane)', () => {
  typedTester.run('must-consume-lazy-typed', rule, {
    valid: [
      `import { LazyPromise } from '@cancjs/toolbox';
       function produce(): LazyPromise<number> {
         return LazyPromise.resolve(1);
       }
       const p = produce();
       p.execute();`,
    ],
    invalid: [
      // Call returning LazyPromise in statement position reports with types
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               declare function fetchLazy(): LazyPromise<number>;
               function run() {
                 fetchLazy();
               }`,
        errors: [
          {
            messageId: 'unusedLazy' as const,
            line: 4,
          },
        ],
      },
    ],
  });
});
