import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import rule from '../../src/rules/no-throw-in-chain-callback.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/failure');
const fixtureProjectDir = path.resolve(__dirname, '../fixtures/projects/default');

const invalid12Path = path.join(corpusDir, 'invalid/12-no-throw-in-then.ts');
const invalid13Path = path.join(corpusDir, 'invalid/13-no-throw-in-catch.ts');
const invalid14Path = path.join(corpusDir, 'invalid/14-no-throw-in-finally.ts');
const invalid15Path = path.join(corpusDir, 'invalid/15-no-throw-reject-bare.ts');

const valid11Path = path.join(corpusDir, 'valid/11-named-chain-handlers.ts');
const valid12Path = path.join(corpusDir, 'valid/12-fail-and-reject-in-chain.ts');

const codeInvalid12 = fs.readFileSync(invalid12Path, 'utf8');
const codeInvalid13 = fs.readFileSync(invalid13Path, 'utf8');
const codeInvalid14 = fs.readFileSync(invalid14Path, 'utf8');
const codeInvalid15 = fs.readFileSync(invalid15Path, 'utf8');

const codeValid11 = fs.readFileSync(valid11Path, 'utf8');
const codeValid12 = fs.readFileSync(valid12Path, 'utf8');

const markers12 = readMarkers(invalid12Path);
const markers13 = readMarkers(invalid13Path).filter((m) => m.ruleId === 'no-throw-in-chain-callback');
const markers14 = readMarkers(invalid14Path);
const markers15 = readMarkers(invalid15Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('no-throw-in-chain-callback (typed lane)', () => {
  typedTester.run('no-throw-in-chain-callback', rule, {
    valid: [
      // 1. Corpus valid 11: named callbacks (rule cannot see inside)
      codeValid11,

      // 2. Corpus valid 12: fail() and typed reject() in chain callbacks,
      //    local catch rethrow, CancelError
      codeValid12,

      // Non-canc class with .then() is silent
      `class CustomThenable<T> {
         then(fn: (v: T) => unknown) { return this; }
       }
       const p = new CustomThenable<string>();
       export const c = p.then(() => {
         throw new Error('boom');
       });`,

      // Local CancelablePromise class without @cancjs is silent
      `class CancelablePromise<T> {
         then(fn: (v: T) => unknown) { return this; }
       }
       const p = new CancelablePromise<string>();
       export const c = p.then(() => {
         throw new Error('boom');
       });`,

      // 3. Return CancelablePromise.fail() is valid
      `import CancelablePromise from '@cancjs/promise';
       class SpecificError extends Error {}
       declare const p: CancelablePromise<string>;
       export const c = p.then(() => {
         return CancelablePromise.fail(new SpecificError());
       });`,

      // 4. Return CancelablePromise.reject<never, E>() with explicit type args is valid
      `import CancelablePromise from '@cancjs/promise';
       class SpecificError extends Error {}
       declare const p: CancelablePromise<string>;
       export const c = p.catch(() => {
         return CancelablePromise.reject<never, SpecificError>(new SpecificError());
       });`,

      // 5. Local catch rethrow inside callback is valid
      `import type CancelablePromise from '@cancjs/promise';
       declare const p: CancelablePromise<string>;
       export const c = p.then(() => {
         try {
           // nested work
         } catch (err) {
           throw err;
         }
       });`,

      // 6. Throwing CancelError is valid (carved out)
      `import type CancelablePromise from '@cancjs/promise';
       import { CancelError } from '@cancjs/promise';
       declare const p: CancelablePromise<string>;
       export const c = p.then(() => {
         throw new CancelError();
       });`,

      // 7. Native Promise chain throw is silent (receiver is not cancelable)
      `const p: Promise<string> = Promise.resolve('ok');
       export const c = p.then(() => {
         throw new Error('native promise throw');
       });`,

      // 8. Throw inside nested arrow in callback is silent
      `import type CancelablePromise from '@cancjs/promise';
       declare const p: CancelablePromise<string>;
       export const c = p.then(() => {
         const helper = () => {
           throw new Error('inside nested arrow');
         };
         helper();
       });`,

      // 9. Throw inside coroutine body is silent (owned by prefer-canc-throw)
      `import { cancAsync } from '@cancjs/coroutine';
       export const task = cancAsync(function* () {
         throw new Error('coroutine throw');
       });`,
    ],

    invalid: [
      // Default type-only import: annotated receiver
      {
        code: `import type CP from '@cancjs/promise';
declare const p: CP<string>;
p.then(() => {
  if (Math.random()) throw new Error('x');
  return 1;
});`,
        output: null,
        errors: [{ messageId: 'throwInChainCallback', line: 4, data: { method: 'then' } }],
      },

      // Default-import alias: annotated receiver
      {
        code: `import CP from '@cancjs/promise';
declare const p: CP<string>;
p.then(() => {
  if (Math.random()) throw new Error('x');
  return 1;
});`,
        output: null,
        errors: [{ messageId: 'throwInChainCallback', line: 4, data: { method: 'then' } }],
      },

      // Default-import alias: constructed receiver
      {
        code: `import CP from '@cancjs/promise';
new CP<string>((resolve) => resolve('a')).then(() => {
  if (Math.random()) throw new Error('x');
  return 1;
});`,
        output: null,
        errors: [{ messageId: 'throwInChainCallback', line: 3, data: { method: 'then' } }],
      },

      // Named import: constructed receiver, two links deep
      {
        code: `import { CancelablePromise } from '@cancjs/promise';
new CancelablePromise<string>((resolve) => resolve('a'))
  .then(() => 1)
  .then(() => {
    if (Math.random()) throw new Error('x');
    return 2;
  });`,
        output: null,
        errors: [{ messageId: 'throwInChainCallback', line: 5, data: { method: 'then' } }],
      },
      // 1. Corpus invalid 12: throw in then
      {
        code: codeInvalid12,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            line: markers12[0].line,
            data: { method: 'then' },
          },
        ],
      },

      // 2. Corpus invalid 13: throw in catch
      {
        code: codeInvalid13,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            line: markers13[0].line,
            data: { method: 'catch' },
          },
        ],
      },

      // 3. Corpus invalid 14: throw in finally
      {
        code: codeInvalid14,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            line: markers14[0].line,
            data: { method: 'finally' },
          },
        ],
      },

      // 4. Corpus invalid 15: bare CancelablePromise.reject() without type args
      {
        code: codeInvalid15,
        output: null,
        errors: [
          {
            messageId: 'rejectWithoutFailure',
            line: markers15[0].line,
            suggestions: [
              {
                messageId: 'rejectWithoutFailure',
                output: codeInvalid15.replace('reject(', 'fail('),
              },
            ],
          },
        ],
      },

      // 5. Tail-throw with in-scope CancelablePromise produces suggestion
      {
        code: `import CancelablePromise from '@cancjs/promise';
class NotFoundError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(() => {
  throw new NotFoundError('Item missing');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            data: { method: 'then' },
            suggestions: [
              {
                messageId: 'throwInChainCallback',
                data: { method: 'then' },
                output: `import CancelablePromise from '@cancjs/promise';
class NotFoundError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(() => {
  return CancelablePromise.fail(new NotFoundError('Item missing'));
});`,
              },
            ],
          },
        ],
      },

      // 6. Throw in then's second (rejection) argument
      {
        code: `import CancelablePromise from '@cancjs/promise';
class NotFoundError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(null, () => {
  throw new NotFoundError('Rejected');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            data: { method: 'then' },
            suggestions: [
              {
                messageId: 'throwInChainCallback',
                data: { method: 'then' },
                output: `import CancelablePromise from '@cancjs/promise';
class NotFoundError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(null, () => {
  return CancelablePromise.fail(new NotFoundError('Rejected'));
});`,
              },
            ],
          },
        ],
      },

      // 7. Non-tail throw: report only, no suggestion
      {
        code: `import CancelablePromise from '@cancjs/promise';
class NotFoundError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(() => {
  throw new NotFoundError('Item missing');
  console.log('after throw');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            data: { method: 'then' },
            suggestions: [],
          },
        ],
      },

      // 8. LazyPromise receiver (reported)
      {
        code: `import type { LazyPromise } from '@cancjs/toolbox';
class NotFoundError extends Error {}
declare const lp: LazyPromise<string>;
export const c = lp.then(() => {
  throw new NotFoundError('Lazy fail');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            data: { method: 'then' },
          },
        ],
      },

      // 9. Untyped CancelablePromise<T> receiver (undeclared failure, reported)
      {
        code: `import type CancelablePromise from '@cancjs/promise';
class NotFoundError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(() => {
  throw new NotFoundError('Undeclared fail');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            data: { method: 'then' },
          },
        ],
      },

      // 10. Bare reject returned from arrow body
      {
        code: `import CancelablePromise from '@cancjs/promise';
class SpecificError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(() => CancelablePromise.reject(new SpecificError('arrow bare')));`,
        output: null,
        errors: [
          {
            messageId: 'rejectWithoutFailure',
            suggestions: [
              {
                messageId: 'rejectWithoutFailure',
                output: `import CancelablePromise from '@cancjs/promise';
class SpecificError extends Error {}
declare const p: CancelablePromise<string>;
export const c = p.then(() => CancelablePromise.fail(new SpecificError('arrow bare')));`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('no-throw-in-chain-callback (untyped lane)', () => {
  untypedTester.run('no-throw-in-chain-callback', rule, {
    valid: [
      // Without type info and without tracked root, non-canc roots are silent
      `declare const p: any;
       export const c = p.then(() => {
         throw new Error('silent without type info');
       });`,
    ],

    invalid: [
      // Tracked static chain root is recognized in untyped mode
      {
        code: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(() => {
  throw new Error('untyped with tracked root');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback',
            data: { method: 'then' },
            suggestions: [
              {
                messageId: 'throwInChainCallback',
                data: { method: 'then' },
                output: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(() => {
  return CancelablePromise.fail(new Error('untyped with tracked root'));
});`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('Accept 1: typecheck with suggested replacement and H3 failure verification', () => {
  it('applied fail() suggestion populates FailureOf cleanly in fixture project', () => {
    const tempFilePath = path.join(fixtureProjectDir, 'src/temp-chain-suggestion.ts');
    const tscBin = path.resolve(__dirname, '../../node_modules/typescript/bin/tsc');
    const content = `import { CancelablePromise } from '@cancjs/promise';
import type { FailureOf } from '@cancjs/promise';

class NotFoundError extends Error {
  readonly _cancErrorBrand = 'NotFoundError';
}

declare const p: CancelablePromise<string, never>;

const chain = p.then(() => {
  return CancelablePromise.fail(new NotFoundError());
});

type ActualFailure = FailureOf<typeof chain>;
type AssertFailure = [ActualFailure] extends [NotFoundError] ? ([NotFoundError] extends [ActualFailure] ? true : false) : false;
export const _assert: AssertFailure = true;
`;

    try {
      fs.writeFileSync(tempFilePath, content, 'utf8');
      const tscOutput = execSync(`node "${tscBin}" --noEmit -p "${fixtureProjectDir}"`, {
        encoding: 'utf8',
      });
      expect(tscOutput).toBe('');
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  });
});

describe('no-throw-in-chain-callback factory options', () => {
  untypedTester.run('no-throw-in-chain-callback factory', rule, {
    valid: [
      // a configured factory body is owned by the throw-in-coroutine rule
      {
        code: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  throw new Error('boom');
});`,
        options: [{ additionalCoroutineFactories: ['then'] }],
      },
      {
        code: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  throw new Error('boom');
});`,
        options: [{ additionalGenCoroutineFactories: ['then'] }],
      },
    ],
    invalid: [
      // same code without the option is a chain callback throw
      {
        code: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  throw new Error('boom');
});`,
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback' as const,
            line: 3,
            data: { method: 'then' },
            suggestions: [
              {
                messageId: 'throwInChainCallback' as const,
                data: { method: 'then' },
                output: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  return CancelablePromise.fail(new Error('boom'));
});`,
              },
            ],
          },
        ],
      },
      // a factory from another source does not apply
      {
        code: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  throw new Error('boom');
});`,
        options: [{ additionalCoroutineFactories: [{ name: 'then', source: '@cancjs/react' }] }],
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback' as const,
            line: 3,
            data: { method: 'then' },
            suggestions: [
              {
                messageId: 'throwInChainCallback' as const,
                data: { method: 'then' },
                output: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  return CancelablePromise.fail(new Error('boom'));
});`,
              },
            ],
          },
        ],
      },
      // a replace list without the callee leaves a plain chain callback
      {
        code: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  throw new Error('boom');
});`,
        options: [{ coroutineFactories: ['onlyMine'] }],
        output: null,
        errors: [
          {
            messageId: 'throwInChainCallback' as const,
            line: 3,
            data: { method: 'then' },
            suggestions: [
              {
                messageId: 'throwInChainCallback' as const,
                data: { method: 'then' },
                output: `import CancelablePromise from '@cancjs/promise';
export const c = CancelablePromise.resolve(1).then(function* () {
  return CancelablePromise.fail(new Error('boom'));
});`,
              },
            ],
          },
        ],
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
