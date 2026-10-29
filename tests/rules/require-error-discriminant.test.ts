import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/require-error-discriminant.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/failure');

const invalid08Path = path.join(corpusDir, 'invalid/08-require-error-discriminant.ts');
const valid08Path = path.join(corpusDir, 'valid/08-error-discriminant.ts');

const codeInvalid08 = fs.readFileSync(invalid08Path, 'utf8');
const codeValid08 = fs.readFileSync(valid08Path, 'utf8');

const markers08 = readMarkers(invalid08Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('require-error-discriminant (typed lane)', () => {
  typedTester.run('require-error-discriminant', rule, {
    valid: [
      // Valid corpus fixtures (discriminated, and unused empty error)
      codeValid08,
      // Class extending another user error class that DOES have a discriminant
      `import type { CancelablePromise } from '@cancjs/promise';
       class BaseUserError extends Error {
         readonly kind = 'BaseUser' as const;
       }
       class InheritedDiscriminantError extends BaseUserError {}
       export declare const p: CancelablePromise<string, InheritedDiscriminantError>;`,
      // Interface extending Error (silent)
      `import type { CancelablePromise } from '@cancjs/promise';
       interface MyInterfaceError extends Error {
         code?: number;
       }
       export declare const p: CancelablePromise<string, MyInterfaceError>;`,
      // Guard-only use (empty class used only in catch guard)
      `class GuardOnlyError extends Error {}
       function run() {
         try {
           console.log('work');
         } catch (e) {
           if (e instanceof GuardOnlyError) {
             console.error(e);
           }
         }
       }`,
      // Exclude option silences matching class
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
               export class LegacyHttpError extends Error {}
               export declare const p: CancelablePromise<string, LegacyHttpError>;`,
        options: [{ exclude: ['/^Legacy/u'] }],
      },
      // Exclude beats include precedence
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
               export class LegacyHttpError extends Error {}
               export declare const p: CancelablePromise<string, LegacyHttpError>;`,
        options: [{ include: ['LegacyHttpError'], exclude: ['LegacyHttpError'] }],
      },
      // Include narrows to listed ones (unlisted candidate ignored)
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
               export class OtherEmptyError extends Error {}
               export declare const p: CancelablePromise<string, OtherEmptyError>;`,
        options: [{ include: ['SomeOtherNamedError'] }],
      },
    ],
    invalid: [
      // Corpus invalid file (two empty classes in one failure union)
      {
        code: codeInvalid08,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: markers08[0].line,
            column: 14,
            data: { className: 'StructErrorOne' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { className: 'StructErrorOne' },
                output: codeInvalid08.replace(
                  'export class StructErrorOne extends Error {}',
                  "export class StructErrorOne extends Error {\n  readonly kind = 'StructErrorOne';\n}",
                ),
              },
            ],
          },
          {
            messageId: 'missingDiscriminant',
            line: markers08[1].line,
            column: 14,
            data: { className: 'StructErrorTwo' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { className: 'StructErrorTwo' },
                output: codeInvalid08.replace(
                  'export class StructErrorTwo extends Error {}',
                  "export class StructErrorTwo extends Error {\n  readonly kind = 'StructErrorTwo';\n}",
                ),
              },
            ],
          },
        ],
      },
      // Constructor-only class used as a failure
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
export class CtorOnlyError extends Error {
  constructor() {
    super('custom');
  }
}
export declare const p: CancelablePromise<string, CtorOnlyError>;`,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: 2,
            column: 14,
            data: { className: 'CtorOnlyError' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { className: 'CtorOnlyError' },
                output: `import type { CancelablePromise } from '@cancjs/promise';
export class CtorOnlyError extends Error {
  readonly kind = 'CtorOnlyError';
  constructor() {
    super('custom');
  }
}
export declare const p: CancelablePromise<string, CtorOnlyError>;`,
              },
            ],
          },
        ],
      },
      // Used in canc.throw argument
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
export class ThrownStructError extends Error {}
const task = cancAsync(function* () {
  return yield* cancThrow(new ThrownStructError());
});`,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: 2,
            column: 14,
            data: { className: 'ThrownStructError' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { className: 'ThrownStructError' },
                output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
export class ThrownStructError extends Error {
  readonly kind = 'ThrownStructError';
}
const task = cancAsync(function* () {
  return yield* cancThrow(new ThrownStructError());
});`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('require-error-discriminant (untyped lane)', () => {
  untypedTester.run('require-error-discriminant-untyped', rule, {
    valid: [
      // Without parser services, rule degrades silently with zero messages
      codeInvalid08,
    ],
    invalid: [],
  });
});
