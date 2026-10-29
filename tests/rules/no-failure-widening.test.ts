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
    ],

    invalid: [
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
