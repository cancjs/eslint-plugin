import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/prefer-canceled-property.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/hygiene');

const invalid11Path = path.join(corpusDir, 'invalid/11-prefer-canceled-property.ts');
const valid10Path = path.join(corpusDir, 'valid/10-prefer-canceled-property.ts');

const codeInvalid11 = fs.readFileSync(invalid11Path, 'utf8');
const codeValid10 = fs.readFileSync(valid10Path, 'utf8');

const markers11 = readMarkers(invalid11Path);

const tester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('prefer-canceled-property', () => {
  tester.run('prefer-canceled-property (typed)', rule, {
    valid: [
      codeValid10,
      // User object with isCanceled (non-cancelable)
      `interface UserTask {
         isCanceled: boolean;
       }
       declare const task: UserTask;
       const c = task.isCanceled;`,
      // User object destructuring
      `const task = { isCanceled: true };
       const { isCanceled } = task;
       void isCanceled;`,
      // Assignment target on cancelable (not a read)
      `import CancelablePromise from '@cancjs/promise';
       declare const p: CancelablePromise<void>;
       (p as any).isCanceled = true;`,
      // LazyPromise receiver (does not extend CancelablePromise)
      `import { LazyPromise } from '@cancjs/toolbox';
       declare const lp: LazyPromise<number> & { isCanceled: boolean };
       void lp.isCanceled;`,
      // User class named CancelablePromise without canc import (B1)
      `class CancelablePromise { isCanceled = false; }
       const p = new CancelablePromise();
       if (p.isCanceled) {}`,
      // User type alias named CancelablePromise without canc import (B1)
      `type CancelablePromise<T> = Promise<T> & { isCanceled?: boolean };
       declare const p: CancelablePromise<void>;
       if (p.isCanceled) {}`,
      `type CancelablePromise<T> = Promise<T>;
       declare const p: CancelablePromise<void> & { isCanceled: boolean };
       if (p.isCanceled) {}`,
    ],
    invalid: [
      // 1. Corpus invalid 11: p.isCanceled -> p.canceled
      {
        code: codeInvalid11,
        output: codeInvalid11.replace('return p.isCanceled;', 'return p.canceled;'),
        errors: [
          {
            messageId: 'preferCanceledProperty' as const,
            line: markers11[0].line,
          },
        ],
      },
      // 2. Optional chaining: p?.isCanceled -> p?.canceled
      {
        code: `import { CancelablePromise } from '@cancjs/promise';
declare const p: CancelablePromise<string> | undefined;
const status = p?.isCanceled;`,
        output: `import { CancelablePromise } from '@cancjs/promise';
declare const p: CancelablePromise<string> | undefined;
const status = p?.canceled;`,
        errors: [
          {
            messageId: 'preferCanceledProperty' as const,
            line: 3,
            column: 19,
          },
        ],
      },
      // 3. Computed bracket notation with single quotes: p['isCanceled'] -> p['canceled']
      {
        code: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const status = p['isCanceled'];`,
        output: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const status = p['canceled'];`,
        errors: [
          {
            messageId: 'preferCanceledProperty' as const,
            line: 3,
            column: 18,
          },
        ],
      },
      // 4. Computed bracket notation with double quotes: p["isCanceled"] -> p["canceled"]
      {
        code: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const status = p["isCanceled"];`,
        output: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const status = p["canceled"];`,
        errors: [
          {
            messageId: 'preferCanceledProperty' as const,
            line: 3,
            column: 18,
          },
        ],
      },
      // 5. Destructuring shorthand: const { isCanceled } = p (suggestion only, no autofix)
      {
        code: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const { isCanceled } = p;`,
        output: null,
        errors: [
          {
            messageId: 'preferCanceledProperty' as const,
            line: 3,
            column: 9,
            suggestions: [
              {
                messageId: 'suggestCanceledKey' as const,
                output: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const { canceled: isCanceled } = p;`,
              },
            ],
          },
        ],
      },
      // 6. Destructuring with rename: const { isCanceled: local } = p
      {
        code: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const { isCanceled: local } = p;`,
        output: null,
        errors: [
          {
            messageId: 'preferCanceledProperty' as const,
            line: 3,
            column: 9,
            suggestions: [
              {
                messageId: 'suggestCanceledKey' as const,
                output: `import CancelablePromise from '@cancjs/promise';
declare const p: CancelablePromise<number>;
const { canceled: local } = p;`,
              },
            ],
          },
        ],
      },
    ],
  });

  // Untyped lane: silent because type information is required
  untypedTester.run('prefer-canceled-property (untyped)', rule, {
    valid: [codeValid10, codeInvalid11, `const { isCanceled } = p;`, `const status = p.isCanceled;`],
    invalid: [],
  });
});
