import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/prefer-signal-option.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/hygiene');

const invalid01Path = path.join(corpusDir, 'invalid/01-prefer-signal-option-manual-listener.ts');
const invalid02Path = path.join(corpusDir, 'invalid/02-prefer-signal-option-manual-preabort-check.ts');

const valid01Path = path.join(corpusDir, 'valid/01-prefer-signal-option.ts');
const valid02Path = path.join(corpusDir, 'valid/02-prefer-signal-option-array-composition.ts');

const codeInvalid01 = fs.readFileSync(invalid01Path, 'utf8');
const codeInvalid02 = fs.readFileSync(invalid02Path, 'utf8');

const codeValid01 = fs.readFileSync(valid01Path, 'utf8');
const codeValid02 = fs.readFileSync(valid02Path, 'utf8');

const markers01 = readMarkers(invalid01Path);
const markers02 = readMarkers(invalid02Path);

const tester = ruleTester({ types: false });

describe('prefer-signal-option', () => {
  tester.run('prefer-signal-option', rule, {
    valid: [
      codeValid01,
      codeValid02,
      // Locally created controller is silent
      `import CancelablePromise from '@cancjs/promise';
       new CancelablePromise((resolve, reject) => {
         const controller = new AbortController();
         controller.signal.addEventListener('abort', () => {});
       });`,
      // Non-canc Promise is silent
      `function test(signal: AbortSignal) {
         return new Promise((resolve) => {
           signal.addEventListener('abort', () => {});
         });
       }`,
      // getSignal forwarding is silent
      `import CancelablePromise from '@cancjs/promise';
       new CancelablePromise((resolve, reject, { getSignal }) => {
         const s = getSignal();
       });`,
      // Mid-flight abort check inside nested timer/event callback is silent
      `import CancelablePromise from '@cancjs/promise';
       function run(signal: AbortSignal) {
         return new CancelablePromise((resolve) => {
           setTimeout(() => {
             if (signal.aborted) return;
             resolve(1);
           }, 10);
         });
       }`,
    ],
    invalid: [
      {
        code: codeInvalid01,
        errors: [
          {
            messageId: 'manualSignalWiring' as const,
            line: markers01[0].line,
            data: { signal: 'signal' },
            suggestions: [
              {
                messageId: 'addSignalOption' as const,
                data: { signal: 'signal' },
                output: codeInvalid01.replace(
                  'fetchQuotes(controller.signal).then(resolve, reject);\n  });',
                  'fetchQuotes(controller.signal).then(resolve, reject);\n  }, { signal: signal });',
                ),
              },
            ],
          },
        ],
      },
      {
        code: codeInvalid02,
        errors: [
          {
            messageId: 'preAbortCheck' as const,
            line: markers02[0].line,
            data: { signal: 'signal' },
            suggestions: [
              {
                messageId: 'addSignalOption' as const,
                data: { signal: 'signal' },
                output: codeInvalid02.replace(
                  'fetchQuotes().then(resolve, reject);\n  });',
                  'fetchQuotes().then(resolve, reject);\n  }, { signal: signal });',
                ),
              },
            ],
          },
        ],
      },
      // Options already holding signal: report only, no suggestions
      {
        code: `import CancelablePromise from '@cancjs/promise';
               function run(signal: AbortSignal) {
                 return new CancelablePromise((resolve, reject) => {
                   signal.addEventListener('abort', () => {});
                 }, { signal });
               }`,
        errors: [
          {
            messageId: 'manualSignalWiring' as const,
            line: 4,
            data: { signal: 'signal' },
            suggestions: null,
          },
        ],
      },
      // Non-literal options: report only, no suggestions
      {
        code: `import CancelablePromise from '@cancjs/promise';
               function run(signal: AbortSignal, opts: any) {
                 return new CancelablePromise((resolve, reject) => {
                   signal.addEventListener('abort', () => {});
                 }, opts);
               }`,
        errors: [
          {
            messageId: 'manualSignalWiring' as const,
            line: 4,
            data: { signal: 'signal' },
            suggestions: null,
          },
        ],
      },
      // LazyPromise executor tracked with same behavior
      {
        code: `import { LazyPromise } from '@cancjs/toolbox';
               function run(signal: AbortSignal) {
                 return new LazyPromise((resolve, reject) => {
                   signal.addEventListener('abort', () => {});
                 });
               }`,
        errors: [
          {
            messageId: 'manualSignalWiring' as const,
            line: 4,
            data: { signal: 'signal' },
            suggestions: [
              {
                messageId: 'addSignalOption' as const,
                data: { signal: 'signal' },
                output: `import { LazyPromise } from '@cancjs/toolbox';
               function run(signal: AbortSignal) {
                 return new LazyPromise((resolve, reject) => {
                   signal.addEventListener('abort', () => {});
                 }, { signal: signal });
               }`,
              },
            ],
          },
        ],
      },
      // Listener inside nested function in executor
      {
        code: `import CancelablePromise from '@cancjs/promise';
               function run(signal: AbortSignal) {
                 return new CancelablePromise((resolve, reject) => {
                   const helper = () => {
                     signal.addEventListener('abort', () => {});
                   };
                   helper();
                 });
               }`,
        errors: [
          {
            messageId: 'manualSignalWiring' as const,
            line: 5,
            data: { signal: 'signal' },
            suggestions: [
              {
                messageId: 'addSignalOption' as const,
                data: { signal: 'signal' },
                output: `import CancelablePromise from '@cancjs/promise';
               function run(signal: AbortSignal) {
                 return new CancelablePromise((resolve, reject) => {
                   const helper = () => {
                     signal.addEventListener('abort', () => {});
                   };
                   helper();
                 }, { signal: signal });
               }`,
              },
            ],
          },
        ],
      },
      // Pre-abort check with custom reject param name (rej)
      {
        code: `import CancelablePromise from '@cancjs/promise';
               function run(signal: AbortSignal) {
                 return new CancelablePromise((res, rej) => {
                   if (signal.aborted) {
                     rej(new Error('aborted'));
                     return;
                   }
                 });
               }`,
        errors: [
          {
            messageId: 'preAbortCheck' as const,
            line: 4,
            data: { signal: 'signal' },
            suggestions: [
              {
                messageId: 'addSignalOption' as const,
                data: { signal: 'signal' },
                output: `import CancelablePromise from '@cancjs/promise';
               function run(signal: AbortSignal) {
                 return new CancelablePromise((res, rej) => {
                   if (signal.aborted) {
                     rej(new Error('aborted'));
                     return;
                   }
                 }, { signal: signal });
               }`,
              },
            ],
          },
        ],
      },
      // Pre-abort check with optional chaining (signal?.aborted) and binary check
      {
        code: `import CancelablePromise from '@cancjs/promise';
               function run(signal?: AbortSignal) {
                 return new CancelablePromise((resolve, reject) => {
                   if (signal?.aborted) {
                     return;
                   }
                 });
               }`,
        errors: [
          {
            messageId: 'preAbortCheck' as const,
            line: 4,
            data: { signal: 'signal' },
            suggestions: [
              {
                messageId: 'addSignalOption' as const,
                data: { signal: 'signal' },
                output: `import CancelablePromise from '@cancjs/promise';
               function run(signal?: AbortSignal) {
                 return new CancelablePromise((resolve, reject) => {
                   if (signal?.aborted) {
                     return;
                   }
                 }, { signal: signal });
               }`,
              },
            ],
          },
        ],
      },
    ],
  });
});
