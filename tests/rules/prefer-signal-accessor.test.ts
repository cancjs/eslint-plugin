import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/prefer-signal-accessor.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/hygiene');

const invalid10Path = path.join(corpusDir, 'invalid/10-prefer-signal-accessor.ts');
const valid09Path = path.join(corpusDir, 'valid/09-prefer-signal-accessor.ts');

const codeInvalid10 = fs.readFileSync(invalid10Path, 'utf8');
const codeValid09 = fs.readFileSync(valid09Path, 'utf8');

const markers10 = readMarkers(invalid10Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('prefer-signal-accessor', () => {
  typedTester.run('prefer-signal-accessor (typed)', rule, {
    valid: [
      // 1. Corpus valid twin
      codeValid09,

      // 2. promisify positional argument (documented asymmetry, stays getSignal)
      `import { promisify } from '@cancjs/toolbox';
       const fn = promisify((resolve, reject, getSignal) => {
         const signal = getSignal();
         void signal;
         resolve();
       });`,

      // 3. Unrelated object with getSignal
      `const obj = {
         getSignal() {
           return new AbortController().signal;
         },
       };
       const s = obj.getSignal();`,
      // Helper function with ctx parameter but not an executor (B2 zero-FP)
      `function helper(ctx: any) {
         return ctx.getSignal();
       }`,
      `function handle(ctx: { getSignal(): AbortSignal }) {
         return ctx.getSignal();
       }`,
    ],
    invalid: [
      // 1. Corpus invalid 10: ctx.getSignal() -> ctx.signal
      {
        code: codeInvalid10,
        output: codeInvalid10.replace('ctx.getSignal()', 'ctx.signal'),
        errors: [
          {
            messageId: 'preferSignalAccessor' as const,
            line: markers10[0].line,
          },
        ],
      },

      // 2. Destructuring: { getSignal } -> { signal } with call rewrite
      {
        code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { getSignal }) => {
  const s = getSignal();
  void s;
});`,
        output: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { signal }) => {
  const s = signal;
  void s;
});`,
        errors: [
          {
            messageId: 'preferSignalAccessor' as const,
            line: 2,
            column: 43,
          },
        ],
      },

      // 3. Renamed destructuring: { getSignal: gs } -> { signal: gs } with call rewrite
      {
        code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { getSignal: gs }) => {
  const s = gs();
  void s;
});`,
        output: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { signal: gs }) => {
  const s = gs;
  void s;
});`,
        errors: [
          {
            messageId: 'preferSignalAccessor' as const,
            line: 2,
            column: 43,
          },
        ],
      },

      // 4. Name collision: local binding named signal -> suggestion only (no autofix)
      {
        code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { getSignal }) => {
  const signal = 'existing';
  const s = getSignal();
  void signal;
  void s;
});`,
        output: null,
        errors: [
          {
            messageId: 'preferSignalAccessor' as const,
            line: 2,
            column: 43,
            suggestions: [
              {
                messageId: 'preferSignalAccessor' as const,
                output: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { signal }) => {
  const signal = 'existing';
  const s = signal;
  void signal;
  void s;
});`,
              },
            ],
          },
        ],
      },

      // 5. cancelify callback with destructuring
      {
        code: `import { cancelify } from '@cancjs/toolbox';
cancelify(({ getSignal }, id: string) => {
  const s = getSignal();
  void s;
});`,
        output: `import { cancelify } from '@cancjs/toolbox';
cancelify(({ signal }, id: string) => {
  const s = signal;
  void s;
});`,
        errors: [
          {
            messageId: 'preferSignalAccessor' as const,
            line: 2,
            column: 14,
          },
        ],
      },
    ],
  });

  untypedTester.run('prefer-signal-accessor (untyped)', rule, {
    valid: [
      codeValid09,
      `const obj = { getSignal: () => null }; obj.getSignal();`,
      `const fn = promisify((resolve, reject, getSignal) => { getSignal(); });`,
    ],
    invalid: [
      {
        code: codeInvalid10,
        output: codeInvalid10.replace('ctx.getSignal()', 'ctx.signal'),
        errors: [
          {
            messageId: 'preferSignalAccessor' as const,
            line: markers10[0].line,
          },
        ],
      },
    ],
  });
});
