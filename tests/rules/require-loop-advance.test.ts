import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/require-loop-advance.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const valid18Path = path.join(corpusDir, 'valid/18-require-loop-advance-rfc.ts');
const valid19Path = path.join(corpusDir, 'valid/19-require-loop-advance-destructive-source.ts');
const valid20Path = path.join(corpusDir, 'valid/20-require-loop-advance-callback.ts');

const invalid18Path = path.join(corpusDir, 'invalid/18-require-loop-advance-sugar-missing.ts');
const invalid19Path = path.join(corpusDir, 'invalid/19-require-loop-advance-handle-continue.ts');
const invalid20Path = path.join(corpusDir, 'invalid/20-require-loop-advance-branch-advance.ts');

const codeValid18 = fs.readFileSync(valid18Path, 'utf8');
const codeValid19 = fs.readFileSync(valid19Path, 'utf8');
const codeValid20 = fs.readFileSync(valid20Path, 'utf8');

const codeInvalid18 = fs.readFileSync(invalid18Path, 'utf8');
const codeInvalid19 = fs.readFileSync(invalid19Path, 'utf8');
const codeInvalid20 = fs.readFileSync(invalid20Path, 'utf8');

const markers18 = readMarkers(invalid18Path);
const markers19 = readMarkers(invalid19Path);
const markers20 = readMarkers(invalid20Path);

const outputInvalid19 = codeInvalid19.replace(
  '    if (item.skip) continue; // lint: require-loop-advance:continueBeforeAdvance\n    if (item.done) break;\n    yield* cancAwait(save(item));\n    yield* loop.next();',
  '    yield* loop.next();\n    if (item.skip) continue; // lint: require-loop-advance:continueBeforeAdvance\n    if (item.done) break;\n    yield* cancAwait(save(item));',
);

const untypedTester = ruleTester({ types: false });
const typedTester = ruleTester({ types: true });

describe('require-loop-advance', () => {
  untypedTester.run('require-loop-advance (untyped)', rule, {
    valid: [
      // 1. Corpus valid twins
      codeValid18,
      codeValid19,
      codeValid20,

      // 2. Inline valid: advance first
      `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
       declare function save(x: number): Promise<void>;
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         for (const x of yield* cancForAwait(source)) {
           yield* cancForAwait.next();
           if (x === 0) continue;
           yield* cancAwait(save(x));
         }
       });`,

      // 3. Inline valid: advance last no continue
      `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
       declare function save(x: number): Promise<void>;
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           yield* cancAwait(save(x));
           yield* loop.next();
         }
       });`,

      // 4. Inline valid: nested handle loops each advancing their own handle
      `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
       declare function save(x: number, y: number): Promise<void>;
       const run = cancAsync(function* (s1: AsyncIterable<number>, s2: AsyncIterable<number>) {
         const outerLoop = yield* cancForAwait(s1);
         for (const x of outerLoop) {
           yield* outerLoop.next();
           const innerLoop = yield* cancForAwait(s2);
           for (const y of innerLoop) {
             yield* innerLoop.next();
             yield* cancAwait(save(x, y));
           }
         }
       });`,

      // 5. Inline valid: callback form
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare function save(x: number): Promise<void>;
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         yield* cancForAwait(source, (x: number) => {
           return save(x);
         });
       });`,

      // 6. Inline valid: cancGenForAwait
      `import { cancGenAsync, cancGenForAwait } from '@cancjs/coroutine/gen';
       const run = cancGenAsync(function* (source: AsyncIterable<number>) {
         yield* cancGenForAwait(source, (x: number) => {});
       });`,

      // 7. Inline valid: local function named cancForAwait (not imported)
      `function cancForAwait(x: unknown) { return x; }
       function* run(source: unknown[]) {
         for (const x of (yield* cancForAwait(source) as unknown[])) {
           void x;
         }
       }`,

      // 8. Inline valid: continue inside nested inner loop targets inner
      `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
       declare function save(x: number): Promise<void>;
       const run = cancAsync(function* (source: AsyncIterable<number>) {
         for (const x of yield* cancForAwait(source)) {
           for (let i = 0; i < 3; i++) {
             if (i === 1) continue;
           }
           yield* cancAwait(save(x));
           yield* cancForAwait.next();
         }
       });`,

      // 9. Inline valid: inner block does not shadow loop
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const item of loop) {
           {
             yield* loop.next();
           }
         }
       });`,

      // 10. Inline valid: exhaustive if/else with continue afterwards
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           if (x > 0) {
             yield* loop.next();
           } else {
             yield* loop.next();
           }
           if (x === 1) continue;
         }
       });`,

      // 11. Inline valid: advance in branch, other branch exits
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           if (x > 0) {
             yield* loop.next();
           } else {
             return;
           }
         }
       });`,

      // 12. Inline valid: exhaustive switch where every branch advances
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           switch (x) {
             case 1:
               yield* loop.next();
               break;
             default:
               yield* loop.next();
               break;
           }
         }
       });`,

      // 13. Inline valid: labeled block with advance before break
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           lbl: {
             yield* loop.next();
             if (x === 0) break lbl;
           }
         }
       });`,

      // 14. Inline valid: non-null assertion on handle advance receiver
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           yield* loop!.next();
           void x;
         }
       });`,

      // 15. Inline valid: type assertion on handle advance receiver
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* cancForAwait(source);
         for (const x of loop) {
           yield* (loop as typeof loop).next();
           void x;
         }
       });`,

      // 16. Inline valid: satisfies expressions on handle init, loop right, and advance receiver
      `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
       declare const source: AsyncIterable<number>;
       const run = cancAsync(function* () {
         const loop = yield* (cancForAwait(source) satisfies ReturnType<typeof cancForAwait>);
         for (const x of loop satisfies typeof loop) {
           yield* (loop satisfies typeof loop).next();
           void x;
         }
       });`,
    ],

    invalid: [
      // 1. Corpus invalid 18: sugar loop without advance
      {
        code: codeInvalid18,
        errors: markers18.map((m) => ({
          messageId: 'missingAdvance' as const,
          line: m.line,
          suggestions: [
            {
              messageId: 'suggestAdvanceFirst' as const,
              output: codeInvalid18.replace(
                '    if (item.done) break;\n    yield* cancAwait(save(item));',
                '    yield* cancForAwait.next();\n    if (item.done) break;\n    yield* cancAwait(save(item));',
              ),
            },
          ],
        })),
      },

      // 2. Corpus invalid 19: continue before advance
      {
        code: codeInvalid19,
        errors: markers19.map((m) => ({
          messageId: 'continueBeforeAdvance' as const,
          line: m.line,
          suggestions: [
            {
              messageId: 'suggestAdvanceFirst' as const,
              output: outputInvalid19,
            },
          ],
        })),
      },

      // 3. Corpus invalid 20: advance inside if only
      {
        code: codeInvalid20,
        errors: markers20.map((m) => ({
          messageId: 'missingAdvance' as const,
          line: m.line,
          suggestions: [],
        })),
      },

      // 4. Inline invalid: sugar missing with suggestion output
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  for (const x of yield* cancForAwait(source)) {
    yield* cancAwait(save(x));
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'cancForAwait.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  for (const x of yield* cancForAwait(source)) {
    yield* cancForAwait.next();
    yield* cancAwait(save(x));
  }
});`,
              },
            ],
          },
        ],
      },

      // 5. Inline invalid: handle missing with suggestion output
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    yield* cancAwait(save(x));
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    yield* loop.next();
    yield* cancAwait(save(x));
  }
});`,
              },
            ],
          },
        ],
      },

      // 6. Inline invalid: continue before advance with suggestion output
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    if (x === 0) continue;
    yield* cancAwait(save(x));
    yield* loop.next();
  }
});`,
        errors: [
          {
            messageId: 'continueBeforeAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    yield* loop.next();
    if (x === 0) continue;
    yield* cancAwait(save(x));
  }
});`,
              },
            ],
          },
        ],
      },

      // 7. Inline invalid: advance only inside if + continue elsewhere (cannot fall through)
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    if (x > 10) {
      yield* loop.next();
    } else {
      if (x === 0) continue;
      return;
    }
    yield* cancAwait(save(x));
  }
});`,
        errors: [
          {
            messageId: 'continueBeforeAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [],
          },
        ],
      },

      // 7a: branch-only advance without continue
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    if (x > 0) {
      yield* loop.next();
    }
    yield* cancAwait(save(x));
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [],
          },
        ],
      },

      // 7b: switch without advance on every branch
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    switch (x) {
      case 1:
        yield* cancAwait(save(x));
        break;
      default:
        yield* loop.next();
        break;
    }
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [],
          },
        ],
      },

      // 7c: switch without default case
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    switch (x) {
      case 1:
        yield* loop.next();
        break;
    }
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [],
          },
        ],
      },

      // 7d: switch case block with break
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
declare const source: AsyncIterable<number>;
const run = cancAsync(function* () {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    switch (x) {
      case 1: {
        break;
      }
      default:
        yield* loop.next();
        break;
    }
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [],
          },
        ],
      },

      // 7e: switch case if with break
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
declare const source: AsyncIterable<number>;
declare const foo: boolean;
const run = cancAsync(function* () {
  const loop = yield* cancForAwait(source);
  for (const x of loop) {
    switch (x) {
      case 1:
        if (foo) break;
        yield* loop.next();
        break;
      default:
        yield* loop.next();
        break;
    }
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [],
          },
        ],
      },

      // 8. Inline invalid: namespace import advance last + continue
      {
        code: `import * as canc from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = canc.cancAsync(function* (source: AsyncIterable<number>) {
  for (const x of yield* canc.forAwait(source)) {
    if (x === 0) continue;
    yield* canc.cancAwait(save(x));
    yield* canc.forAwait.next();
  }
});`,
        errors: [
          {
            messageId: 'continueBeforeAdvance',
            data: { advance: 'canc.forAwait.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import * as canc from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = canc.cancAsync(function* (source: AsyncIterable<number>) {
  for (const x of yield* canc.forAwait(source)) {
    yield* canc.forAwait.next();
    if (x === 0) continue;
    yield* canc.cancAwait(save(x));
  }
});`,
              },
            ],
          },
        ],
      },

      // 9. Inline invalid: labeled outer loop with continue outer from inner for
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  outer: for (const x of yield* cancForAwait(source)) {
    for (let i = 0; i < 3; i++) {
      if (i === 1) continue outer;
    }
    yield* cancAwait(save(x));
    yield* cancForAwait.next();
  }
});`,
        errors: [
          {
            messageId: 'continueBeforeAdvance',
            data: { advance: 'cancForAwait.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  outer: for (const x of yield* cancForAwait(source)) {
    yield* cancForAwait.next();
    for (let i = 0; i < 3; i++) {
      if (i === 1) continue outer;
    }
    yield* cancAwait(save(x));
  }
});`,
              },
            ],
          },
        ],
      },

      // 10. Inline invalid: continue inside a switch inside body before advance
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  for (const x of yield* cancForAwait(source)) {
    switch (x) {
      case 1:
        continue;
      default:
        break;
    }
    yield* cancAwait(save(x));
    yield* cancForAwait.next();
  }
});`,
        errors: [
          {
            messageId: 'continueBeforeAdvance',
            data: { advance: 'cancForAwait.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number): Promise<void>;
const run = cancAsync(function* (source: AsyncIterable<number>) {
  for (const x of yield* cancForAwait(source)) {
    yield* cancForAwait.next();
    switch (x) {
      case 1:
        continue;
      default:
        break;
    }
    yield* cancAwait(save(x));
  }
});`,
              },
            ],
          },
        ],
      },

      // 11. Inline invalid: nested handle loops where outer never advances
      {
        code: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number, y: number): Promise<void>;
const run = cancAsync(function* (s1: AsyncIterable<number>, s2: AsyncIterable<number>) {
  const outerLoop = yield* cancForAwait(s1);
  for (const x of outerLoop) {
    const innerLoop = yield* cancForAwait(s2);
    for (const y of innerLoop) {
      yield* innerLoop.next();
      yield* cancAwait(save(x, y));
    }
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'outerLoop.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait, cancAwait } from '@cancjs/coroutine';
declare function save(x: number, y: number): Promise<void>;
const run = cancAsync(function* (s1: AsyncIterable<number>, s2: AsyncIterable<number>) {
  const outerLoop = yield* cancForAwait(s1);
  for (const x of outerLoop) {
    yield* outerLoop.next();
    const innerLoop = yield* cancForAwait(s2);
    for (const y of innerLoop) {
      yield* innerLoop.next();
      yield* cancAwait(save(x, y));
    }
  }
});`,
              },
            ],
          },
        ],
      },

      // 12. Inline invalid: inner block shadows loop
      {
        code: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
declare const source: AsyncIterable<number>;
declare const other: { next(): Generator<unknown, void, unknown> };
const run = cancAsync(function* () {
  const loop = yield* cancForAwait(source);
  for (const item of loop) {
    {
      const loop = other;
      yield* loop.next();
    }
  }
});`,
        errors: [
          {
            messageId: 'missingAdvance',
            data: { advance: 'loop.next()' },
            suggestions: [
              {
                messageId: 'suggestAdvanceFirst',
                output: `import { cancAsync, cancForAwait } from '@cancjs/coroutine';
declare const source: AsyncIterable<number>;
declare const other: { next(): Generator<unknown, void, unknown> };
const run = cancAsync(function* () {
  const loop = yield* cancForAwait(source);
  for (const item of loop) {
    yield* loop.next();
    {
      const loop = other;
      yield* loop.next();
    }
  }
});`,
              },
            ],
          },
        ],
      },
    ],
  });

  typedTester.run('require-loop-advance (typed)', rule, {
    valid: [codeValid18, codeValid19, codeValid20],
    invalid: [
      {
        code: codeInvalid18,
        errors: markers18.map((m) => ({
          messageId: 'missingAdvance' as const,
          line: m.line,
          suggestions: [
            {
              messageId: 'suggestAdvanceFirst' as const,
              output: codeInvalid18.replace(
                '    if (item.done) break;\n    yield* cancAwait(save(item));',
                '    yield* cancForAwait.next();\n    if (item.done) break;\n    yield* cancAwait(save(item));',
              ),
            },
          ],
        })),
      },
      {
        code: codeInvalid19,
        errors: markers19.map((m) => ({
          messageId: 'continueBeforeAdvance' as const,
          line: m.line,
          suggestions: [
            {
              messageId: 'suggestAdvanceFirst' as const,
              output: outputInvalid19,
            },
          ],
        })),
      },
      {
        code: codeInvalid20,
        errors: markers20.map((m) => ({
          messageId: 'missingAdvance' as const,
          line: m.line,
          suggestions: [],
        })),
      },
    ],
  });
});
