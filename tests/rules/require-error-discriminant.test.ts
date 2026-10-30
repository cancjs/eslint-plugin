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

const invalid17Path = path.join(corpusDir, 'invalid/17-require-error-discriminant-static-only.ts');
const codeInvalid17 = fs.readFileSync(invalid17Path, 'utf8');
const markers17 = readMarkers(invalid17Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('require-error-discriminant (typed lane)', () => {
  typedTester.run('require-error-discriminant', rule, {
    valid: [
      // Valid corpus fixtures (discriminated, and unused empty error)
      codeValid08,
      // Local look-alike carrier type is not a canc failure declaration
      `declare class CancelablePromise<T, E = unknown> {
         t?: T;
         e?: E;
       }
       export class LookAlikeCarrierError extends Error {}
       export declare function run(): CancelablePromise<void, LookAlikeCarrierError>;`,
      // Local look-alike withFailure is not a canc failure declaration
      `declare function withFailure<E>(): void;
       export class LookAlikeWithFailureError extends Error {}
       withFailure<LookAlikeWithFailureError>();`,
      // Local look-alike isErrorOf is not a canc matcher
      `declare function isErrorOf(error: unknown, ...matchers: unknown[]): boolean;
       export class LookAlikeMatcherError extends Error {}
       export function check(e: unknown): boolean {
         return isErrorOf(e, LookAlikeMatcherError);
       }`,
      // Class extending another user error class that DOES have a discriminant
      `import type { CancelablePromise } from '@cancjs/promise';
       class BaseUserError extends Error {
         readonly kind = 'BaseUser' as const;
       }
       class InheritedDiscriminantError extends BaseUserError {}
       export declare const p: CancelablePromise<string, InheritedDiscriminantError>;`,
      // Abstract members count as an instance discriminant (silent)
      `import type { CancelablePromise } from '@cancjs/promise';
       abstract class AbstractKindError extends Error {
         abstract readonly kind: 'k';
       }
       export declare const p: CancelablePromise<string, AbstractKindError>;`,
      `import type { CancelablePromise } from '@cancjs/promise';
       abstract class AbstractAccessorError extends Error {
         abstract accessor kind: 'k';
       }
       export declare const p: CancelablePromise<string, AbstractAccessorError>;`,
      `import type { CancelablePromise } from '@cancjs/promise';
       abstract class AbstractGetterError extends Error {
         abstract get kind(): 'k';
       }
       export declare const p: CancelablePromise<string, AbstractGetterError>;`,
      `import type { CancelablePromise } from '@cancjs/promise';
       abstract class AbstractMethodError extends Error {
         abstract describe(): string;
       }
       export declare const p: CancelablePromise<string, AbstractMethodError>;`,
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
      // Default import under a non-canonical local name resolves through the canc symbol
      {
        code: `import type CP from '@cancjs/promise';

export class StructErrorOne extends Error {}
export class StructErrorTwo extends Error {}

export declare const p: CP<string, StructErrorOne | StructErrorTwo>;`,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: 3,
            data: { name: 'StructErrorOne' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'StructErrorOne' },
                output: `import type CP from '@cancjs/promise';

export class StructErrorOne extends Error {
  readonly kind = 'StructErrorOne';
}
export class StructErrorTwo extends Error {}

export declare const p: CP<string, StructErrorOne | StructErrorTwo>;`,
              },
            ],
          },
          {
            messageId: 'missingDiscriminant',
            line: 4,
            data: { name: 'StructErrorTwo' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'StructErrorTwo' },
                output: `import type CP from '@cancjs/promise';

export class StructErrorOne extends Error {}
export class StructErrorTwo extends Error {
  readonly kind = 'StructErrorTwo';
}

export declare const p: CP<string, StructErrorOne | StructErrorTwo>;`,
              },
            ],
          },
        ],
      },
      // Corpus invalid file (two empty classes in one failure union)
      {
        code: codeInvalid08,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: markers08[0].line,
            column: 14,
            data: { name: 'StructErrorOne' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'StructErrorOne' },
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
            data: { name: 'StructErrorTwo' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'StructErrorTwo' },
                output: codeInvalid08.replace(
                  'export class StructErrorTwo extends Error {}',
                  "export class StructErrorTwo extends Error {\n  readonly kind = 'StructErrorTwo';\n}",
                ),
              },
            ],
          },
        ],
      },
      // Static-only members are not discriminants
      {
        code: codeInvalid17,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: markers17[0].line,
            column: 14,
            data: { name: 'StaticCodeErrorA' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'StaticCodeErrorA' },
                output: codeInvalid17.replace(
                  "  static readonly code = 'A';",
                  "  readonly kind = 'StaticCodeErrorA';\n  static readonly code = 'A';",
                ),
              },
            ],
          },
          {
            messageId: 'missingDiscriminant',
            line: markers17[1].line,
            column: 14,
            data: { name: 'StaticCodeErrorB' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'StaticCodeErrorB' },
                output: codeInvalid17.replace(
                  "  static readonly code = 'B';",
                  "  readonly kind = 'StaticCodeErrorB';\n  static readonly code = 'B';",
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
            data: { name: 'CtorOnlyError' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'CtorOnlyError' },
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
            data: { name: 'ThrownStructError' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'ThrownStructError' },
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
      // Empty class in type alias referenced in CancelablePromise failure position
      {
        code: `import type CancelablePromise from '@cancjs/promise';
export class EmptyTypeAliasError extends Error {}
type AppFailures = EmptyTypeAliasError | Error;
export declare function run(): CancelablePromise<void, AppFailures>;`,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: 2,
            column: 14,
            data: { name: 'EmptyTypeAliasError' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'EmptyTypeAliasError' },
                output: `import type CancelablePromise from '@cancjs/promise';
export class EmptyTypeAliasError extends Error {
  readonly kind = 'EmptyTypeAliasError';
}
type AppFailures = EmptyTypeAliasError | Error;
export declare function run(): CancelablePromise<void, AppFailures>;`,
              },
            ],
          },
        ],
      },
      // Mutable override message = '...' without literal type is not a discriminant
      {
        code: `import type CancelablePromise from '@cancjs/promise';
export class MutableMessageError extends Error {
  override message: string = 'msg';
}
export declare function run(): CancelablePromise<void, MutableMessageError>;`,
        output: null,
        errors: [
          {
            messageId: 'missingDiscriminant',
            line: 2,
            column: 14,
            data: { name: 'MutableMessageError' },
            suggestions: [
              {
                messageId: 'missingDiscriminant',
                data: { name: 'MutableMessageError' },
                output: `import type CancelablePromise from '@cancjs/promise';
export class MutableMessageError extends Error {
  readonly kind = 'MutableMessageError';
  override message: string = 'msg';
}
export declare function run(): CancelablePromise<void, MutableMessageError>;`,
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
