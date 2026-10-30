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

const invalid13Path = path.join(corpusDir, 'invalid/13-no-abort-listener-leak-executor-catch-only.ts');
const invalid12Path = path.join(corpusDir, 'invalid/12-no-abort-listener-leak-then-callback.ts');

const valid05Path = path.join(corpusDir, 'valid/05-no-abort-listener-leak.ts');
const valid95Path = path.join(corpusDir, 'valid/95-adversarial-executor-listener-outer-finally.ts');
const valid96Path = path.join(corpusDir, 'valid/96-adversarial-executor-listener-cleanup-list.ts');
const valid97Path = path.join(corpusDir, 'valid/97-adversarial-executor-listener-finally-callback.ts');
const valid94Path = path.join(corpusDir, 'valid/94-adversarial-finally-callback-removal.ts');

const codeInvalid05 = fs.readFileSync(invalid05Path, 'utf8');
const codeInvalid09 = fs.readFileSync(invalid09Path, 'utf8');
const codeValid05 = fs.readFileSync(valid05Path, 'utf8');
const codeInvalid12 = fs.readFileSync(invalid12Path, 'utf8');
const codeInvalid13 = fs.readFileSync(invalid13Path, 'utf8');
const codeValid95 = fs.readFileSync(valid95Path, 'utf8');
const codeValid96 = fs.readFileSync(valid96Path, 'utf8');
const codeValid97 = fs.readFileSync(valid97Path, 'utf8');
const codeValid94 = fs.readFileSync(valid94Path, 'utf8');

const markers05 = readMarkers(invalid05Path);
const markers09 = readMarkers(invalid09Path);
const markers13 = readMarkers(invalid13Path);
const markers12 = readMarkers(invalid12Path);

const tester = ruleTester({ types: false });

describe('no-abort-listener-leak', () => {
  tester.run('no-abort-listener-leak', rule, {
    valid: [
      // 1. Corpus valid (once: true + finally remove)
      codeValid05,
      // Removal inside the returned chain's finally callback, no once option
      codeValid94,
      // Executor listener removed in the finally block of the enclosing function
      codeValid95,
      codeValid96,
      // Listener added in a Promise executor, removed in the finally callback of the returned chain
      codeValid97,
      `declare function work(): Promise<string>;
async function run(signal: AbortSignal) {
  const onAbort = () => {};
  try {
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', onAbort);
      resolve();
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}`,
      `declare function callRemote(signal: AbortSignal): Promise<string>;
function run(signal: AbortSignal) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  return callRemote(signal).finally(() => signal.removeEventListener('abort', onAbort));
}`,
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
      `import { createAbortSignal } from '@cancjs/toolbox';
       function run() {
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
      // A break whose loop lies inside the finally is not a jump out
      `function run(signal: AbortSignal, xs: boolean[]) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    for (const x of xs) { if (x) break; }
    signal.removeEventListener('abort', onAbort);
  }
}`,
      // A continue whose loop lies inside the finally is not a jump out
      `function run(signal: AbortSignal, xs: boolean[]) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    for (const x of xs) { if (x) continue; }
    signal.removeEventListener('abort', onAbort);
  }
}`,
      // A break out of a switch inside the finally is local
      `function run(signal: AbortSignal, xs: boolean[]) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    switch (xs.length) { case 0: break; }
    signal.removeEventListener('abort', onAbort);
  }
}`,
      // A labeled break whose label lies inside the finally is local
      `function run(signal: AbortSignal, xs: boolean[]) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    inner: for (const x of xs) { for (const y of xs) { if (x && y) break inner; } }
    signal.removeEventListener('abort', onAbort);
  }
}`,
    ],
    invalid: [
      // A labeled break to a loop outside the finally skips the removal
      {
        code: `function run(signal: AbortSignal, xs: boolean[]) {
  const onAbort = () => {};
  outer: for (const z of xs) { try {
    signal.addEventListener('abort', onAbort);
  } finally {
    for (const x of xs) { if (x) break outer; }
    signal.removeEventListener('abort', onAbort);
  } }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 4 }],
      },
      // A labeled continue to a loop outside the finally skips the removal
      {
        code: `function run(signal: AbortSignal, xs: boolean[]) {
  const onAbort = () => {};
  outer: for (const z of xs) { try {
    signal.addEventListener('abort', onAbort);
  } finally {
    for (const x of xs) { if (x) continue outer; }
    signal.removeEventListener('abort', onAbort);
  } }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 4 }],
      },
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
      // Registration in a deferred callback is not covered by the outer finally
      {
        code: `function run(signal: AbortSignal) {
  const onAbort = () => {};
  try {
    setTimeout(() => {
      signal.addEventListener('abort', onAbort);
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 5 }],
      },
      // Conditional return in finally skips the removal
      {
        code: `function run(signal: AbortSignal, c: boolean) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    if (c) return;
    signal.removeEventListener('abort', onAbort);
  }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 4 }],
      },
      // Nested try in finally: a throwing call before the removal skips it
      {
        code: `function run(signal: AbortSignal) {
  const onAbort = () => {};
  try {
    signal.addEventListener('abort', onAbort);
  } finally {
    try {
      flush();
      signal.removeEventListener('abort', onAbort);
    } catch {}
  }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 4 }],
      },
      // A createAbortSignal that is not imported from a canc source is not trusted
      {
        code: `function run() {
  const signal = createAbortSignal();
  signal.addEventListener('abort', () => {});
}`,
        errors: [{ messageId: 'inlineListenerNoOnce' as const, line: 3 }],
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
      // Removal only in a then callback: a failed call leaves the listener behind
      {
        code: codeInvalid12,
        errors: [
          {
            messageId: (markers12[0].messageId ?? 'leakedAbortListener') as 'leakedAbortListener',
            line: markers12[0].line,
          },
        ],
      },
      // The finally callback removes a different listener
      {
        code: `declare function callRemote(signal: AbortSignal): Promise<string>;
function run(signal: AbortSignal) {
  const onAbort = () => {};
  const other = () => {};
  signal.addEventListener('abort', onAbort);
  return callRemote(signal).finally(() => signal.removeEventListener('abort', other));
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 5 }],
      },
      // The finally callback returns before the removal
      {
        code: `declare function callRemote(signal: AbortSignal): Promise<string>;
declare const skip: boolean;
function run(signal: AbortSignal) {
  const onAbort = () => {};
  signal.addEventListener('abort', onAbort);
  return callRemote(signal).finally(() => {
    if (skip) return;
    signal.removeEventListener('abort', onAbort);
  });
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 5 }],
      },
      // Executor registration whose enclosing function removes only on the failure path
      {
        code: codeInvalid13,
        errors: [
          {
            messageId: (markers13[0].messageId ?? 'leakedAbortListener') as 'leakedAbortListener',
            line: markers13[0].line,
          },
        ],
      },
      // The enclosing finally removes the listener from a different signal
      {
        code: `declare function work(): Promise<string>;
async function run(signal: AbortSignal, other: AbortSignal) {
  const onAbort = () => {};
  try {
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', onAbort);
      resolve();
    });
  } finally {
    other.removeEventListener('abort', onAbort);
  }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 6 }],
      },
      // The finally block sits in an unrelated function, so it does not cover the executor
      {
        code: `async function run(signal: AbortSignal) {
  const onAbort = () => {};
  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', onAbort);
    resolve();
  });
}
async function unrelated(signal: AbortSignal) {
  const onAbort = () => {};
  try {
    await Promise.resolve();
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 4 }],
      },
      // The cleanup list is iterated in a plain function, not a loop callback run by the finally
      {
        code: `async function run(signals: AbortSignal[], other: AbortSignal) {
  const cleanup: Array<{ signal: AbortSignal; listener: () => void }> = [];
  try {
    await new Promise<void>((resolve) => {
      signals.forEach((signal) => {
        const listener = () => resolve();
        signal.addEventListener('abort', listener);
        cleanup.push({ signal, listener });
      });
    });
  } finally {
    cleanup.forEach(({ listener }) => {
      other.removeEventListener('abort', listener);
    });
  }
}`,
        errors: [{ messageId: 'leakedAbortListener' as const, line: 7 }],
      },
    ],
  });
});
