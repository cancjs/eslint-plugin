import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/prefer-cancel-aware-wrapper.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid14Path = path.join(corpusDir, 'invalid/14-prefer-cancel-aware-wrapper.ts');
const valid12Path = path.join(corpusDir, 'valid/12-prefer-cancel-aware-wrapper.ts');

const codeInvalid14 = fs.readFileSync(invalid14Path, 'utf8');
const codeValid12 = fs.readFileSync(valid12Path, 'utf8');

const markers14 = readMarkers(invalid14Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('prefer-cancel-aware-wrapper', () => {
  typedTester.run('prefer-cancel-aware-wrapper (typed)', rule, {
    valid: [
      // 1. Corpus valid twin (uses cancelify)
      codeValid12,

      // 2. Signal used without a finally-abort
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import { createAbortSignal } from '@cancjs/toolbox';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const { signal } = createAbortSignal();
         yield* cancAwait(fetchWithSignal(url, signal));
       });`,

      // 3. Low-level executor adapter (new CancelablePromise, not a coroutine)
      `import CancelablePromise from '@cancjs/promise';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       function adapt(url: string) {
         return new CancelablePromise((resolve, reject, { handleCancel }) => {
           const controller = new AbortController();
           handleCancel(() => controller.abort());
           fetchWithSignal(url, controller.signal).then(resolve, reject);
         });
       }`,

      // 4. Controller created outside the coroutine
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const controller = new AbortController();
       const run = cancAsync(function* (url: string) {
         try {
           yield* cancAwait(fetchWithSignal(url, controller.signal));
         } finally {
           controller.abort();
         }
       });`,

      // 5. Abort in catch block only (not finally)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const controller = new AbortController();
         try {
           yield* cancAwait(fetchWithSignal(url, controller.signal));
         } catch (err) {
           controller.abort();
         }
       });`,

      // 6. Abort inside a nested function's finally (another scope)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const controller = new AbortController();
         function inner() {
           try {
             fetchWithSignal(url, controller.signal);
           } finally {
             controller.abort();
           }
         }
         inner();
       });`,
    ],
    invalid: [
      // 1. Corpus invalid 14 (createAbortSignal with destructuring + abort in finally)
      {
        code: codeInvalid14,
        errors: [
          {
            messageId: 'manualCancelWiring' as const,
            line: markers14[0].line,
            column: 7,
          },
        ],
      },
      // 2. AbortController instance with controller.abort() in finally
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
const run = cancAsync(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        errors: [
          {
            messageId: 'manualCancelWiring' as const,
            line: 11,
            column: 7,
          },
        ],
      },
    ],
  });

  untypedTester.run('prefer-cancel-aware-wrapper (untyped)', rule, {
    valid: [
      codeValid12,
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import { createAbortSignal } from '@cancjs/toolbox';
       const run = cancAsync(function* (url) {
         const { signal } = createAbortSignal();
         yield* cancAwait(fetchWithSignal(url, signal));
       });`,
    ],
    invalid: [
      {
        code: codeInvalid14,
        errors: [
          {
            messageId: 'manualCancelWiring' as const,
            line: markers14[0].line,
            column: 7,
          },
        ],
      },
    ],
  });
});
