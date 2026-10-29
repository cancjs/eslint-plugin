import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/canc-throw-tail-position.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/failure');

const invalid04Path = path.join(corpusDir, 'invalid/04-canc-throw-tail-position.ts');
const valid04Path = path.join(corpusDir, 'valid/04-return-canc-throw-dialects.ts');

const codeInvalid04 = fs.readFileSync(invalid04Path, 'utf8');
const codeValid04 = fs.readFileSync(valid04Path, 'utf8');

const markers04 = readMarkers(invalid04Path);

const tester = ruleTester({ types: false });

describe('canc-throw-tail-position', () => {
  tester.run('canc-throw-tail-position', rule, {
    valid: [
      codeValid04,
      // Already return yield*
      `import { cancAsync, cancThrow } from '@cancjs/coroutine';
       const run = cancAsync(function* () {
         return yield* cancThrow(new Error());
       });`,
      // Non-canc function named throw
      `function myThrow(err: any) { return []; }
       function* plain() {
         yield* myThrow(new Error());
       }`,
      // Non-canc function named throw inside coroutine
      `import { cancAsync } from '@cancjs/coroutine';
       function notCancThrow(e: any) { return []; }
       const run = cancAsync(function* () {
         yield* notCancThrow(new Error());
       });`,
      // Non-throw delegate (e.g. cancAwait)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       const run = cancAsync(function* () {
         yield* cancAwait(Promise.resolve(1));
       });`,
    ],
    invalid: [
      {
        code: codeInvalid04,
        output: codeInvalid04.replace(
          "  yield* cancThrow(new NotFoundError('Item not found'));",
          "  return yield* cancThrow(new NotFoundError('Item not found'));",
        ),
        errors: [
          {
            messageId: 'cancThrowTailPosition' as const,
            line: markers04[0].line,
            column: 3,
            data: { thrower: 'cancThrow' },
          },
        ],
      },
      // Both branches of an if throwing
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* (cond: boolean) {
  if (cond) {
    yield* cancThrow(new Error('A'));
  } else {
    yield* cancThrow(new Error('B'));
  }
});`,
        output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* (cond: boolean) {
  if (cond) {
    return yield* cancThrow(new Error('A'));
  } else {
    return yield* cancThrow(new Error('B'));
  }
});`,
        errors: [
          {
            messageId: 'cancThrowTailPosition' as const,
            line: 4,
            column: 5,
            data: { thrower: 'cancThrow' },
          },
          {
            messageId: 'cancThrowTailPosition' as const,
            line: 6,
            column: 5,
            data: { thrower: 'cancThrow' },
          },
        ],
      },
      // Inside try with a finally (still fix)
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  try {
    yield* cancThrow(new Error('Fail'));
  } finally {
    cleanup();
  }
});`,
        output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  try {
    return yield* cancThrow(new Error('Fail'));
  } finally {
    cleanup();
  }
});`,
        errors: [
          {
            messageId: 'cancThrowTailPosition' as const,
            line: 4,
            column: 5,
            data: { thrower: 'cancThrow' },
          },
        ],
      },
      // Loop body (suggestion only, no autofix: assert output unchanged and suggestions length 1)
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  while (true) {
    yield* cancThrow(new Error('Loop'));
  }
});`,
        output: null,
        errors: [
          {
            messageId: 'cancThrowTailPosition' as const,
            line: 4,
            column: 5,
            data: { thrower: 'cancThrow' },
            suggestions: [
              {
                messageId: 'cancThrowTailPosition' as const,
                data: { thrower: 'cancThrow' },
                output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  while (true) {
    return yield* cancThrow(new Error('Loop'));
  }
});`,
              },
            ],
          },
        ],
      },
      // Gen dialect and namespace callee
      {
        code: `import * as gen from '@cancjs/coroutine/gen';
const run = gen.cancGenAsync(function* () {
  yield* gen.throw(new Error('Gen'));
});`,
        output: `import * as gen from '@cancjs/coroutine/gen';
const run = gen.cancGenAsync(function* () {
  return yield* gen.throw(new Error('Gen'));
});`,
        errors: [
          {
            messageId: 'cancThrowTailPosition' as const,
            line: 3,
            column: 3,
            data: { thrower: 'gen.throw' },
          },
        ],
      },
      // Followed by executable statement (suggestion only, no autofix)
      {
        code: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  yield* cancThrow(new Error('Mid'));
  console.log('done');
});`,
        output: null,
        errors: [
          {
            messageId: 'cancThrowTailPosition' as const,
            line: 3,
            column: 3,
            data: { thrower: 'cancThrow' },
            suggestions: [
              {
                messageId: 'cancThrowTailPosition' as const,
                data: { thrower: 'cancThrow' },
                output: `import { cancAsync, cancThrow } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  return yield* cancThrow(new Error('Mid'));
  console.log('done');
});`,
              },
            ],
          },
        ],
      },
    ],
  });
});
