import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/no-failure-widening.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/failure');

const invalid09Path = path.join(corpusDir, 'invalid/09-no-failure-widening-cast.ts');
const invalid10Path = path.join(corpusDir, 'invalid/10-no-failure-widening-return.ts');
const invalid11Path = path.join(corpusDir, 'invalid/11-no-failure-widening-open-set.ts');

const valid09Path = path.join(corpusDir, 'valid/09-deliberate-erasure-marker.ts');
const valid10Path = path.join(corpusDir, 'valid/10-sanctioned-with-failure-forms.ts');

const codeInvalid09 = fs.readFileSync(invalid09Path, 'utf8');
const codeInvalid10 = fs.readFileSync(invalid10Path, 'utf8');
const codeInvalid11 = fs.readFileSync(invalid11Path, 'utf8');

const codeValid09 = fs.readFileSync(valid09Path, 'utf8');
const codeValid10 = fs.readFileSync(valid10Path, 'utf8');

const markers09 = readMarkers(invalid09Path);
const markers10 = readMarkers(invalid10Path);
const markers11 = readMarkers(invalid11Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('no-failure-widening (typed lane)', () => {
  typedTester.run('no-failure-widening', rule, {
    valid: [
      // Valid corpus twins
      codeValid09,
      codeValid10,

      // as const (silent)
      `const x = { a: 1 } as const;`,

      // cast on non-promise (silent)
      `const str = 'hello' as any;`,

      // cast keeping the set (silent)
      `import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export const kept = p as CancelablePromise<string, ErrorA>;`,

      // satisfies (silent)
      `import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export const s = p satisfies CancelablePromise<string, ErrorA>;`,

      // Widening TO an open set: Foo -> Foo | Unlisted (silent)
      `import type CancelablePromise from '@cancjs/promise';
       interface Unlisted { readonly _cancUnlisted: true; }
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export const open = p as CancelablePromise<string, ErrorA | Unlisted>;`,

      // Variable annotation default: allowVariableAnnotationWidening: true (silent)
      `import type CancelablePromise from '@cancjs/promise';
       class UserNotFoundError extends Error {}
       declare function getUser(): CancelablePromise<string, UserNotFoundError>;
       export const b: CancelablePromise<string> = getUser();`,

      // Untyped source (silent)
      `import type CancelablePromise from '@cancjs/promise';
       declare const untypedP: CancelablePromise<string>;
       export const dropped = untypedP as any;`,

      // Function call argument (silent)
      `import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       declare function getUser(): CancelablePromise<string, ErrorA>;
       declare function show(p: any): void;
       show(getUser());`,

      // Sanctioned withFailure forms (all valid)
      `import type CancelablePromise from '@cancjs/promise';
       import { withFailure } from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export const res = withFailure<ErrorA>()(p);`,

      // User-defined FAILURE symbol on a non-canc carrier (silent)
      `declare const FAILURE: unique symbol;
       class ErrorA extends Error {}
       interface Mine<T, E> { readonly [FAILURE]?: E; value: T }
       declare const m: Mine<string, ErrorA>;
       export const x = m as any;`,

      // Local CancelablePromise look-alike with [FAILURE] (silent)
      `declare const FAILURE: unique symbol;
       class ErrorA extends Error {}
       class CancelablePromise<T, E = unknown> { readonly [FAILURE]?: E; value?: T }
       declare const p: CancelablePromise<string, ErrorA>;
       export const x = p as any;`,
      // Union with a user FAILURE-symbol branch: that branch adds no failures (silent)
      `import type { CancelablePromise } from '@cancjs/promise';
       declare const FAILURE: unique symbol;
       class ErrorA extends Error {}
       class ErrorB extends Error {}
       interface Mine<T, E> { readonly [FAILURE]?: E; value: T }
       declare const p: CancelablePromise<string, ErrorA> | Mine<string, ErrorB>;
       export const x = p as unknown as CancelablePromise<string, ErrorA>;`,
      // A local structural copy of the open-set marker is the marker (silent)
      `import type { CancelablePromise, Unlisted } from '@cancjs/promise';
       interface UnlistedCopy { readonly _cancUnlisted: true; }
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA | UnlistedCopy>;
       export const open = p as CancelablePromise<string, ErrorA | Unlisted>;`,
      // Target union with a non-canc branch claims nothing about it: identical failures (silent)
      `import type { CancelablePromise } from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export const c = p as CancelablePromise<string, ErrorA> | string;`,
      `import type { CancelablePromise } from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export function f(): CancelablePromise<string, ErrorA> | string {
         return p;
       }`,
      `import type { CancelablePromise } from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export function f(): CancelablePromise<string, ErrorA> | false {
         return p;
       }`,
      `import type { CancelablePromise } from '@cancjs/promise';
       class ErrorA extends Error {}
       declare const p: CancelablePromise<string, ErrorA>;
       export const f = (): CancelablePromise<string, ErrorA> | number => p;`,
    ],

    invalid: [
      // Default import under a non-canonical local name resolves through the canc symbol
      {
        code: `import type CP from '@cancjs/promise';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }

declare const p: CP<string, ErrorA | ErrorB>;
export const widened: CP<string, ErrorA> = p as any;`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 7, data: { position: 'cast' } }],
      },
      // 1. Corpus invalid 09: p as any drops failure set
      {
        code: codeInvalid09,
        output: null,
        errors: [
          {
            messageId: 'failureWidening',
            line: markers09[0].line,
            data: { position: 'cast' },
          },
        ],
      },

      // 2. Corpus invalid 10: return annotation drops ErrorB
      {
        code: codeInvalid10,
        output: null,
        errors: [
          {
            messageId: 'failureWidening',
            line: markers10[0].line,
            data: { position: 'return type' },
          },
        ],
      },

      // 3. Corpus invalid 11: Foo | Unlisted -> Bar | Unlisted (drops Foo)
      {
        code: codeInvalid11,
        output: null,
        errors: [
          {
            messageId: 'failureWidening',
            line: markers11[0].line,
            data: { position: 'cast' },
          },
        ],
      },

      // 4. Cast with withFailure in scope produces suggestion
      {
        code: `import type CancelablePromise from '@cancjs/promise';
import { withFailure } from '@cancjs/promise';
class ErrorA extends Error {}
class UserNotFoundError extends Error {}
declare function getUser(): CancelablePromise<string, ErrorA>;
export const u = getUser() as CancelablePromise<string, UserNotFoundError>;`,
        output: null,
        errors: [
          {
            messageId: 'failureWidening',
            data: { position: 'cast' },
            suggestions: [
              {
                messageId: 'failureWidening',
                data: { position: 'cast' },
                output: `import type CancelablePromise from '@cancjs/promise';
import { withFailure } from '@cancjs/promise';
class ErrorA extends Error {}
class UserNotFoundError extends Error {}
declare function getUser(): CancelablePromise<string, ErrorA>;
export const u = withFailure<UserNotFoundError>()(getUser());`,
              },
            ],
          },
        ],
      },

      // 5. allowVariableAnnotationWidening: false flags variable annotation
      {
        code: `import type CancelablePromise from '@cancjs/promise';
class UserNotFoundError extends Error {}
declare function getUser(): CancelablePromise<string, UserNotFoundError>;
export const b: CancelablePromise<string> = getUser();`,
        options: [{ allowVariableAnnotationWidening: false }],
        output: null,
        errors: [
          {
            messageId: 'failureWidening',
            data: { position: 'variable type' },
          },
        ],
      },
      // 6. return p as any: exactly one report, on the cast
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
declare const p: CancelablePromise<string, ErrorA>;
export function f() {
  return p as any;
}`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 5, data: { position: 'cast' } }],
      },

      // 7. return p as CancelablePromise<string>: exactly one report
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
declare const p: CancelablePromise<string, ErrorA>;
export function f() {
  return p as CancelablePromise<string>;
}`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 5, data: { position: 'cast' } }],
      },

      // 8. arrow expression body cast: exactly one report
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
declare const p: CancelablePromise<string, ErrorA>;
export const f = () => p as any;`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 4, data: { position: 'cast' } }],
      },

      // 9. variable declarator cast: one report even with variable checks on
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
declare const p: CancelablePromise<string, ErrorA>;
export const v: CancelablePromise<string> = p as CancelablePromise<string>;`,
        options: [{ allowVariableAnnotationWidening: false }],
        output: null,
        errors: [{ messageId: 'failureWidening', line: 4, data: { position: 'cast' } }],
      },

      // 10. mixed union with a non-canc branch: cast still reports once
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
declare const p: CancelablePromise<string, ErrorA> | { z: 1 };
export const m = p as unknown as CancelablePromise<string>;`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 4, data: { position: 'cast' } }],
      },
      // 11. Target union keeps one canc branch that drops a failure: still widening
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
class ErrorB extends Error {}
declare const p: CancelablePromise<string, ErrorA | ErrorB>;
export const c = p as CancelablePromise<string, ErrorA> | string;`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 5, data: { position: 'cast' } }],
      },
      {
        code: `import type { CancelablePromise } from '@cancjs/promise';
class ErrorA extends Error {}
declare const p: CancelablePromise<string, ErrorA>;
export function f(): CancelablePromise<string> | false {
  return p;
}`,
        output: null,
        errors: [{ messageId: 'failureWidening', line: 4, data: { position: 'return type' } }],
      },

      // 12. Suggestion survives a type-only alias of CancelablePromise
      {
        code: `import type { CancelablePromise as CP } from '@cancjs/promise';
import { withFailure } from '@cancjs/promise';
class ErrorA extends Error {}
class UserNotFoundError extends Error {}
declare function getUser(): CP<string, ErrorA>;
export const u = getUser() as CP<string, UserNotFoundError>;`,
        output: null,
        errors: [
          {
            messageId: 'failureWidening',
            data: { position: 'cast' },
            suggestions: [
              {
                messageId: 'failureWidening',
                data: { position: 'cast' },
                output: `import type { CancelablePromise as CP } from '@cancjs/promise';
import { withFailure } from '@cancjs/promise';
class ErrorA extends Error {}
class UserNotFoundError extends Error {}
declare function getUser(): CP<string, ErrorA>;
export const u = withFailure<UserNotFoundError>()(getUser());`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('no-failure-widening (untyped lane)', () => {
  untypedTester.run('no-failure-widening-untyped', rule, {
    valid: [
      // Without parser services, rule degrades silently with zero messages
      codeInvalid09,
      codeInvalid10,
      codeInvalid11,
    ],
    invalid: [],
  });
});
