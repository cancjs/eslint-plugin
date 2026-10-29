import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/prefer-canc-throw.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/failure');

const invalid01Path = path.join(corpusDir, 'invalid/01-prefer-canc-throw-async.ts');
const invalid02Path = path.join(corpusDir, 'invalid/02-prefer-canc-throw-gen.ts');
const invalid03Path = path.join(corpusDir, 'invalid/03-prefer-canc-throw-builtin.ts');

const valid04Path = path.join(corpusDir, 'valid/04-return-canc-throw-dialects.ts');
const valid13Path = path.join(corpusDir, 'valid/13-coroutine-rethrow-cancelerror.ts');

const codeInvalid01 = fs.readFileSync(invalid01Path, 'utf8');
const codeInvalid02 = fs.readFileSync(invalid02Path, 'utf8');
const codeInvalid03 = fs.readFileSync(invalid03Path, 'utf8');

const codeValid04 = fs.readFileSync(valid04Path, 'utf8');
const codeValid13 = fs.readFileSync(valid13Path, 'utf8');

const markers01 = readMarkers(invalid01Path);
const markers02 = readMarkers(invalid02Path);
const markers03 = readMarkers(invalid03Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('prefer-canc-throw (typed lane)', () => {
  typedTester.run('prefer-canc-throw', rule, {
    valid: [
      codeValid04,
      codeValid13,
      // Throw inside nested arrow function (silent)
      `import { cancAsync } from '@cancjs/coroutine';
       const run = cancAsync(function* () {
         const helper = () => {
           throw new Error('inside nested arrow');
         };
         helper();
       });`,
      // Throw new CancelError() and subclass (silent)
      `import { cancAsync } from '@cancjs/coroutine';
       import { CancelError } from '@cancjs/promise';
       class MyCancelSubclass extends CancelError {}
       const run = cancAsync(function* () {
         if (Math.random() > 1) {
           throw new MyCancelSubclass();
         }
       });`,
      // Exclude by regex (silent)
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               class AssertionError extends Error {}
               const run = cancAsync(function* () {
                 throw new AssertionError('check failed');
               });`,
        options: [{ exclude: ['/^Assert/u'] }],
      },
      // Exclude by package specifier (node:assert) vs same-named user class
      // When throwing actual Error matched by exclude
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               const run = cancAsync(function* () {
                 throw new RangeError('out of bounds');
               });`,
        options: [{ exclude: ['RangeError'] }],
      },
    ],
    invalid: [
      // Corpus invalid 01: cancAsync without thrower imported (reports without suggestion)
      {
        code: codeInvalid01,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: markers01[0].line,
            column: 3,
            data: { thrower: 'canc.throw' },
            suggestions: [],
          },
        ],
      },
      // Corpus invalid 02: cancGenAsync without thrower imported
      {
        code: codeInvalid02,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: markers02[0].line,
            column: 3,
            data: { thrower: 'cancGen.throw' },
            suggestions: [],
          },
        ],
      },
      // Corpus invalid 03: bare throw built-in TypeError
      {
        code: codeInvalid03,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: markers03[0].line,
            column: 3,
            data: { thrower: 'canc.throw' },
            suggestions: [],
          },
        ],
      },
      // In-scope thrower provides suggestion (never --fix)
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
class NotFoundError extends Error {}
const run = cancAsync(function* () {
  throw new NotFoundError('Item not found');
});`,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 4,
            column: 3,
            data: { thrower: 'cancThrow' },
            suggestions: [
              {
                messageId: 'preferCancThrow',
                data: { thrower: 'cancThrow' },
                output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
class NotFoundError extends Error {}
const run = cancAsync(function* () {
  return yield* cancThrow(new NotFoundError('Item not found'));
});`,
              },
            ],
          },
        ],
      },
      // cancGen.throw in-scope tracked binding
      {
        code: `import { cancGenAsync, cancGen } from '@cancjs/coroutine/gen';
const run = cancGenAsync(function* () {
  throw new Error('fail');
});`,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 3,
            column: 3,
            data: { thrower: 'cancGen.throw' },
            suggestions: [
              {
                messageId: 'preferCancThrow',
                data: { thrower: 'cancGen.throw' },
                output: `import { cancGenAsync, cancGen } from '@cancjs/coroutine/gen';
const run = cancGenAsync(function* () {
  return yield* cancGen.throw(new Error('fail'));
});`,
              },
            ],
          },
        ],
      },
      // Wrapped error inside catch: throw new Wrap(e) (reported)
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
class WrapError extends Error {
  constructor(public cause: unknown) { super('wrapped'); }
}
const run = cancAsync(function* () {
  try {
    console.log('work');
  } catch (e) {
    throw new WrapError(e);
  }
});`,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 9,
            column: 5,
            data: { thrower: 'cancThrow' },
            suggestions: [
              {
                messageId: 'preferCancThrow',
                data: { thrower: 'cancThrow' },
                output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
class WrapError extends Error {
  constructor(public cause: unknown) { super('wrapped'); }
}
const run = cancAsync(function* () {
  try {
    console.log('work');
  } catch (e) {
    return yield* cancThrow(new WrapError(e));
  }
});`,
              },
            ],
          },
        ],
      },

      // Throw inside catch of a try in body (reported when not rethrow of binding)
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  try {
    console.log('work');
  } catch (e) {
    throw new Error('different error');
  }
});`,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 6,
            column: 5,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
      // Coroutine generator bound to variable then passed to cancAsync
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
const gen = function* () {
  throw new Error('deferred call');
};
export const task = cancAsync(gen);`,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 3,
            column: 3,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
      // allowCatchRethrow: false reports rethrow of catch binding
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  try {
    console.log('work');
  } catch (e) {
    throw e;
  }
});`,
        output: null,
        options: [{ allowCatchRethrow: false }],
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 6,
            column: 5,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
      // Throw of non-new identifier: throw err2
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  const err2 = new Error('local');
  throw err2;
});`,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 4,
            column: 3,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
      // Exclude package specifier { from: 'package', package: 'node:assert', name: 'AssertionError' }
      // vs same-named user class in test file: user class is still reported!
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
class AssertionError extends Error {}
const run = cancAsync(function* () {
  throw new AssertionError('local');
});`,
        output: null,
        options: [{ exclude: [{ from: 'package', package: 'node:assert', name: 'AssertionError' }] }],
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 4,
            column: 3,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
    ],
  });
});

describe('prefer-canc-throw (untyped lane)', () => {
  untypedTester.run('prefer-canc-throw-untyped', rule, {
    valid: [
      codeValid04,
      codeValid13,
      // requireTypeInfo: true degrades silently without parser services
      {
        code: codeInvalid01,
        options: [{ requireTypeInfo: true }],
      },
      // Exclude by string in untyped lane works syntactically
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
               class MyCustomError extends Error {}
               const run = cancAsync(function* () {
                 throw new MyCustomError();
               });`,
        options: [{ exclude: ['MyCustomError'] }],
      },
    ],
    invalid: [
      // Untyped lane without requireTypeInfo still reports AST throw
      {
        code: codeInvalid01,
        output: null,
        errors: [
          {
            messageId: 'preferCancThrow',
            line: markers01[0].line,
            column: 3,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
      // Object form matcher does NOT match without type info -> reported
      {
        code: `import { cancAsync } from '@cancjs/coroutine';
class MyCustomError extends Error {}
const run = cancAsync(function* () {
  throw new MyCustomError();
});`,
        output: null,
        options: [{ exclude: [{ from: 'package', package: 'any-package', name: 'MyCustomError' }] }],
        errors: [
          {
            messageId: 'preferCancThrow',
            line: 4,
            column: 3,
            data: { thrower: 'canc.throw' },
          },
        ],
      },
    ],
  });
});
