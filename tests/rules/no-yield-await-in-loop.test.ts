import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/no-yield-await-in-loop.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid15Path = path.join(corpusDir, 'invalid/15-no-yield-await-in-loop.ts');
const valid13Path = path.join(corpusDir, 'valid/13-no-yield-await-in-loop.ts');

const codeInvalid15 = fs.readFileSync(invalid15Path, 'utf8');
const codeValid13 = fs.readFileSync(valid13Path, 'utf8');

const markers15 = readMarkers(invalid15Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('no-yield-await-in-loop', () => {
  typedTester.run('no-yield-await-in-loop (typed)', rule, {
    valid: [
      // 1. Corpus valid twin (uses cancAwait.all)
      codeValid13,

      // 2. Accumulator-dependent loop (operand does NOT reference loop variable)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function step(curr: number): Promise<number>;
       const run = cancAsync(function* (count: number) {
         let current = 0;
         for (let i = 0; i < count; i++) {
           current = yield* cancAwait(step(current));
         }
         return current;
       });`,

      // 3. Sequential search with break
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function check(id: string): Promise<boolean>;
       const run = cancAsync(function* (ids: string[]) {
         for (const id of ids) {
           const ok = yield* cancAwait(check(id));
           if (ok) break;
         }
       });`,

      // 4. Sequential search with return
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function check(id: string): Promise<boolean>;
       const run = cancAsync(function* (ids: string[]) {
         for (const id of ids) {
           const ok = yield* cancAwait(check(id));
           if (ok) return id;
         }
         return null;
       });`,

      // 5. cancForAwait streaming loop (has its own idiom, out of scope)
      `import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
       declare function processOrder(item: string): Promise<void>;
       const run = cancAsync(function* (src: AsyncIterable<string>) {
         yield* cancForAwait(src, function* (item) {
           yield* cancAwait(processOrder(item));
         });
       });`,

      // 6. Outside coroutine context
      `declare function fetchItem(id: string): Promise<void>;
       declare const cancAwait: (p: any) => any;
       function* plainGen(ids: string[]) {
         for (const id of ids) {
           yield* cancAwait(fetchItem(id));
         }
       }`,

      // 7. while loop with queue condition (queue is not a loop index var)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function processQueue(q: string[]): Promise<void>;
       const run = cancAsync(function* (queue: string[]) {
         while (queue.length > 0) {
           yield* cancAwait(processQueue(queue));
         }
       });`,

      // 8. Accumulator mutated in loop body alongside loop variable
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function step(id: string, acc: number): Promise<number>;
       const run = cancAsync(function* (ids: string[]) {
         let acc = 0;
         for (const id of ids) {
           acc = yield* cancAwait(step(id, acc));
         }
         return acc;
       });`,

      // 9. Property access obj.id does not match loop variable id
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchItem(val: any): Promise<void>;
       const run = cancAsync(function* (ids: string[], obj: { id: string }) {
         for (const id of ids) {
           yield* cancAwait(fetchItem(obj.id));
         }
       });`,

      // 10. while loop where condition variable is accumulator assigned from yield*
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function step(curr: number): Promise<number>;
       const run = cancAsync(function* () {
         let acc = 10;
         while (acc > 0) {
           acc = yield* cancAwait(step(acc));
         }
         return acc;
       });`,

      // 11. while loop with cursor pagination
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchPage(cursor: string): Promise<string | null>;
       const run = cancAsync(function* () {
         let cursor: string | null = 'start';
         while (cursor) {
           cursor = yield* cancAwait(fetchPage(cursor));
         }
       });`,

      // 12. Member-write accumulator is sequential like an identifier accumulator
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function f(id: string, state: { x: number }): Promise<number>;
       const run = cancAsync(function* (ids: string[], state: { x: number }) {
         for (const id of ids) {
           state.x = yield* cancAwait(f(id, state));
         }
       });`,

      // 13. Labeled break from an inner loop exits sequentially
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function check(id: string): Promise<boolean>;
       const run = cancAsync(function* (groups: string[][]) {
         outer: for (const group of groups) {
           for (const id of group) {
             const ok = yield* cancAwait(check(id));
             if (ok) break outer;
           }
         }
       });`,

      // 14. Operand depends on a collection the body mutates
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function next(id: string, count: number): Promise<string>;
       const run = cancAsync(function* (ids: string[]) {
         const out: string[] = [];
         for (const id of ids) {
           out.push(yield* cancAwait(next(id, out.length)));
         }
         return out;
       });`,
    ],
    invalid: [
      // 1. Corpus invalid 15: for-of loop referencing id
      {
        code: codeInvalid15,
        errors: [
          {
            messageId: 'serializedSteps' as const,
            line: markers15[0].line,
          },
        ],
      },

      // 2. Index for-loop referencing loop variable i
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function fetchIndex(i: number): Promise<void>;
const run = cancAsync(function* (total: number) {
  for (let i = 0; i < total; i++) {
    yield* cancAwait(fetchIndex(i));
  }
});`,
        errors: [
          {
            messageId: 'serializedSteps' as const,
            line: 5,
            column: 5,
          },
        ],
      },

      // 3. cancGenAsync context with cancGenAwait in for-of loop
      {
        code: `import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
declare function load(id: string): Promise<string>;
const run = cancGenAsync(function* (ids: string[]) {
  for (const id of ids) {
    yield* cancGenAwait(load(id));
  }
});`,
        errors: [
          {
            messageId: 'serializedSteps' as const,
            line: 5,
            column: 5,
          },
        ],
      },

      // 4. Namespace canc.await(...) with loop var
      {
        code: `import * as canc from '@cancjs/coroutine';
declare function load(id: string): Promise<string>;
const run = canc.async(function* (ids: string[]) {
  for (const id of ids) {
    yield* canc.await(load(id));
  }
});`,
        errors: [
          {
            messageId: 'serializedSteps' as const,
            line: 5,
            column: 5,
          },
        ],
      },

      // 5. Parenthesized / casted cancAwait call with loop var
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function load(id: string): Promise<string>;
const run = cancAsync(function* (ids: string[]) {
  for (const id of ids) {
    yield* (cancAwait(load(id)) as any);
  }
});`,
        errors: [
          {
            messageId: 'serializedSteps' as const,
            line: 5,
            column: 5,
          },
        ],
      },

      // 6. Member write to an unrelated object stays independent
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function f(id: string): Promise<number>;
const run = cancAsync(function* (ids: string[], out: Record<string, number>) {
  for (const id of ids) {
    out[id] = yield* cancAwait(f(id));
  }
});`,
        errors: [{ messageId: 'serializedSteps' as const, line: 5 }],
      },

      // 7. Labeled break to a label inside the loop body is not an exit
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function f(id: string): Promise<boolean>;
const run = cancAsync(function* (ids: string[]) {
  for (const id of ids) {
    inner: {
      yield* cancAwait(f(id));
      break inner;
    }
  }
});`,
        errors: [{ messageId: 'serializedSteps' as const, line: 6 }],
      },
    ],
  });

  untypedTester.run('no-yield-await-in-loop (untyped)', rule, {
    valid: [
      codeValid13,
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* (ids) {
         for (const id of ids) {
           if (id) break;
           yield* cancAwait(load(id));
         }
       });`,
    ],
    invalid: [
      {
        code: codeInvalid15,
        errors: [
          {
            messageId: 'serializedSteps' as const,
            line: markers15[0].line,
          },
        ],
      },
    ],
  });
});
