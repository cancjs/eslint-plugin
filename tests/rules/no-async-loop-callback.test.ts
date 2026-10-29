import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/no-async-loop-callback.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid11Path = path.join(corpusDir, 'invalid/11-no-async-loop-callback.ts');
const invalid17Path = path.join(corpusDir, 'invalid/17-no-async-loop-callback-cancgenforawait.ts');
const valid09Path = path.join(corpusDir, 'valid/09-no-async-loop-callback.ts');

const codeInvalid11 = fs.readFileSync(invalid11Path, 'utf8');
const codeInvalid17 = fs.readFileSync(invalid17Path, 'utf8');
const codeValid09 = fs.readFileSync(valid09Path, 'utf8');

const markers11 = readMarkers(invalid11Path);
const markers17 = readMarkers(invalid17Path);

const tester = ruleTester();

describe('no-async-loop-callback', () => {
  tester.run('no-async-loop-callback', rule, {
    valid: [
      codeValid09,
      // Sync arrow callback
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         yield* cancForAwait(source, (n) => {
           console.log(n);
         });
       });`,
      // Generator function callback
      `import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
       declare function step(n: number): Promise<void>;
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         yield* cancForAwait(source, function* (n) {
           yield* cancAwait(step(n));
         });
       });`,
      // cancAsync-wrapped callback
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         yield* cancForAwait(source, cancAsync(function* (n) {
           console.log(n);
         }));
       });`,
      // One-argument loop-handle form
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         const loop = yield* cancForAwait(source);
       });`,
      // .toArray form
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         const arr = yield* cancForAwait.toArray(source);
       });`,
      // Nested async function inside a generator callback is valid (not the direct callback)
      `import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         yield* cancForAwait(source, function* (n) {
           const nested = async () => n * 2;
           yield* cancAwait(nested());
         });
       });`,
      // Non-tracked loop call with 2 arguments
      `declare function otherLoop(src: any, cb: any): any;
       otherLoop(src, async () => {});`,
    ],
    invalid: [
      {
        code: codeInvalid11,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: markers11[0].line,
          },
        ],
      },
      {
        code: codeInvalid17,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: markers17[0].line,
          },
        ],
      },
      // Async function expression with await (report only, no suggestion)
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
               declare function processOrder(order: any): Promise<void>;
               const run = cancAsync(function* (source: any) {
                 yield* cancForAwait(source, async function(order) {
                   await processOrder(order);
                 });
               });`,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: 4,
          },
        ],
      },
      // Namespace member call: canc.forAwait(src, async ...)
      {
        code: `import * as canc from '@cancjs/coroutine';
               declare function processOrder(order: any): Promise<void>;
               const run = canc.cancAsync(function* (source: any) {
                 yield* canc.cancForAwait(source, async (order) => {
                   await processOrder(order);
                 });
               });`,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: 4,
          },
        ],
      },
      // Suggestion: async function expression with NO await -> convertToGenerator
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
               const run = cancAsync(function* (source: any) {
                 yield* cancForAwait(source, async function(order) {
                   console.log(order);
                 });
               });`,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: 3,
            suggestions: [
              {
                messageId: 'convertToGenerator' as const,
                output: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
               const run = cancAsync(function* (source: any) {
                 yield* cancForAwait(source, function*(order) {
                   console.log(order);
                 });
               });`,
              },
            ],
          },
        ],
      },
      // Suggestion: async arrow with NO await -> removeAsync
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
               const run = cancAsync(function* (source: any) {
                 yield* cancForAwait(source, async (order) => {
                   console.log(order);
                 });
               });`,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: 3,
            suggestions: [
              {
                messageId: 'removeAsync' as const,
                output: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
               const run = cancAsync(function* (source: any) {
                 yield* cancForAwait(source, (order) => {
                   console.log(order);
                 });
               });`,
              },
            ],
          },
        ],
      },
      // Identifier callback pointing to async function
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
               declare function processOrder(order: any): Promise<void>;
               const callback = async (order: any) => { await processOrder(order); };
               const run = cancAsync(function* (source: any) {
                 yield* cancForAwait(source, callback);
               });`,
        errors: [
          {
            messageId: 'asyncLoopCallback' as const,
            line: 5,
          },
        ],
      },
    ],
  });

  const typedTester = ruleTester({ types: true });
  typedTester.run('no-async-loop-callback (typed)', rule, {
    valid: [
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       import CancelablePromise from '@cancjs/promise';
       declare function fetchCancelable(n: number): CancelablePromise<void>;
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         yield* cancForAwait(source, (n) => fetchCancelable(n));
       });`,
    ],
    invalid: [],
  });
});
