import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/no-abort-listener-leak.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/hygiene');

const invalid05Path = path.join(corpusDir, 'invalid/05-no-abort-listener-leak.ts');
const invalid09Path = path.join(corpusDir, 'invalid/09-no-abort-listener-leak-inline.ts');

const valid05Path = path.join(corpusDir, 'valid/05-no-abort-listener-leak.ts');

const codeInvalid05 = fs.readFileSync(invalid05Path, 'utf8');
const codeInvalid09 = fs.readFileSync(invalid09Path, 'utf8');
const codeValid05 = fs.readFileSync(valid05Path, 'utf8');

const markers05 = readMarkers(invalid05Path);
const markers09 = readMarkers(invalid09Path);

const tester = ruleTester({ types: false });

describe('no-abort-listener-leak', () => {
  tester.run('no-abort-listener-leak', rule, {
    valid: [
      // 1. Corpus valid (once: true + finally remove)
      codeValid05,
      // 2. Straight-line registration and remove
      `function run(signal: AbortSignal) {
         const onAbort = () => {};
         signal.addEventListener('abort', onAbort);
         signal.removeEventListener('abort', onAbort);
       }`,
      // 3. { once: true } option
      `function run(signal: AbortSignal) {
         const onAbort = () => {};
         signal.addEventListener('abort', onAbort, { once: true });
       }`,
      // 4. Finally block remove
      `function run(signal: AbortSignal) {
         const onAbort = () => {};
         try {
           signal.addEventListener('abort', onAbort);
         } finally {
           signal.removeEventListener('abort', onAbort);
         }
       }`,
      // 5. Remove on both branches of if
      `function run(signal: AbortSignal, cond: boolean) {
         const onAbort = () => {};
         signal.addEventListener('abort', onAbort);
         if (cond) {
           signal.removeEventListener('abort', onAbort);
           return 1;
         } else {
           signal.removeEventListener('abort', onAbort);
           return 2;
         }
       }`,
      // 6. Locally created controller
      `function run() {
         const controller = new AbortController();
         controller.signal.addEventListener('abort', () => {});
       }`,
      // 7. Locally created signal via createAbortSignal
      `function run() {
         const signal = createAbortSignal();
         signal.addEventListener('abort', () => {});
       }`,
      // 8. Locally created controller with destructuring
      `function run() {
         const controller = new AbortController();
         const { signal } = controller;
         signal.addEventListener('abort', () => {});
       }`,
      // 9. Tracked executor (prefer-signal-option owns it, silent)
      `import CancelablePromise from '@cancjs/promise';
       new CancelablePromise((resolve, reject) => {
         externalSignal.addEventListener('abort', () => {});
       });`,
      // 10. Loop body registration with remove inside loop
      `function run(signal: AbortSignal, items: number[]) {
         const onAbort = () => {};
         for (const item of items) {
           signal.addEventListener('abort', onAbort);
           signal.removeEventListener('abort', onAbort);
         }
       }`,
      // 11. Destructured signal from createAbortSignal is local
      `import { createAbortSignal } from '@cancjs/toolbox';
       function run() {
         const { signal } = createAbortSignal();
         signal.addEventListener('abort', () => {});
       }`,
      // 12. Finally block with void removeEventListener
      `function run(signal: AbortSignal) {
         const onAbort = () => {};
         try {
           signal.addEventListener('abort', onAbort);
         } finally {
           void signal.removeEventListener('abort', onAbort);
         }
       }`,
      // 13. Finally block with optional chaining
      `function run(signal: AbortSignal | null) {
         const onAbort = () => {};
         try {
           signal?.addEventListener('abort', onAbort);
         } finally {
           signal?.removeEventListener('abort', onAbort);
         }
       }`,
      // 14. Finally block with try-catch
      `function run(signal: AbortSignal) {
         const onAbort = () => {};
         try {
           signal.addEventListener('abort', onAbort);
         } finally {
           try {
             signal.removeEventListener('abort', onAbort);
           } catch {}
         }
       }`,
    ],
    invalid: [
      // 1. Corpus invalid 05 (leakedAbortListener)
      {
        code: codeInvalid05,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: markers05[0].line,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 2. Corpus invalid 09 (inlineListenerNoOnce)
      {
        code: codeInvalid09,
        errors: [
          {
            messageId: 'inlineListenerNoOnce' as const,
            line: markers09[0].line,
          },
        ],
      },
      // 3. Early return before remove
      {
        code: `function run(signal: AbortSignal, flag: boolean) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  if (flag) return;
  signal.removeEventListener('abort', onAbort);
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 3,
            column: 3,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 4. Remove on one branch only
      {
        code: `function run(signal: AbortSignal, cond: boolean) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  if (cond) {
    signal.removeEventListener('abort', onAbort);
  }
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 3,
            column: 3,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 5. Remove inside callback that may not run
      {
        code: `function run(signal: AbortSignal) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
  }, 100);
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 3,
            column: 3,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 6. Throw before remove without finally
      {
        code: `function run(signal: AbortSignal, bad: boolean) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  if (bad) throw new Error('boom');
  signal.removeEventListener('abort', onAbort);
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 3,
            column: 3,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 7. Loop body registration without remove inside loop
      {
        code: `function run(signal: AbortSignal, items: number[]) {
  const onAbort = () => {};
  for (const item of items) {
    signal.addEventListener('abort', onAbort);
  }
  signal.removeEventListener('abort', onAbort);
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 4,
            column: 5,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 8. Listener variable reassigned
      {
        code: `function run(signal: AbortSignal) {
  let onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  onAbort = () => {};
  signal.removeEventListener('abort', onAbort);
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 3,
            column: 3,
            data: { name: 'onAbort', signal: 'signal' },
          },
        ],
      },
      // 9. Inline function listener expression without once
      {
        code: `function run(signal: AbortSignal) {
  signal.addEventListener('abort', function() {
    console.log('aborted');
  });
}`,
        errors: [
          {
            messageId: 'inlineListenerNoOnce' as const,
            line: 2,
            column: 3,
          },
        ],
      },
      // 10. Removal inside if in finally is not unconditional
      {
        code: `function run(signal: AbortSignal, cond: boolean) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    if (cond) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 4,
            column: 5,
          },
        ],
      },
      // 11. Duplicate registration not overwritten
      {
        code: `function run(signal: AbortSignal) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  signal.addEventListener('abort', onAbort);
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 3,
            column: 3,
          },
          {
            messageId: 'leakedAbortListener' as const,
            line: 4,
            column: 3,
          },
        ],
      },
      // 12. Early return in finally precedes removal
      {
        code: `function run(signal: AbortSignal) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    return;
    signal.removeEventListener('abort', onAbort);
  }
}`,
        errors: [
          {
            messageId: 'leakedAbortListener' as const,
            line: 4,
            column: 5,
          },
        ],
      },
    ],
  });
});
