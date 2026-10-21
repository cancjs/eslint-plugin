import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import rule from '../../src/rules/prefer-canc-combinators.js';
import { readMarkers } from '../helpers/corpus.js';
import { createTypedCorpusLinter } from '../helpers/typed-corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid06Path = path.resolve(__dirname, '../fixtures/corpus/flow/invalid/06-prefer-canc-combinators-all.ts');
const invalid07Path = path.resolve(__dirname, '../fixtures/corpus/flow/invalid/07-prefer-canc-combinators-race.ts');
const invalid10Path = path.resolve(
  __dirname,
  '../fixtures/corpus/flow/invalid/10-prefer-canc-combinators-allsettled.ts',
);

const valid11Path = path.resolve(__dirname, '../fixtures/corpus/flow/valid/11-prefer-canc-combinators-all.ts');
const valid12Path = path.resolve(__dirname, '../fixtures/corpus/flow/valid/12-prefer-canc-combinators-race.ts');
const valid13Path = path.resolve(
  __dirname,
  '../fixtures/corpus/flow/valid/13-prefer-canc-combinators-explicit-adoption.ts',
);
const valid20Path = path.resolve(__dirname, '../fixtures/corpus/flow/valid/20-prefer-canc-combinators-allsettled.ts');

const testCases: {
  valid: (ValidTestCase<[]> | string)[];
  invalid: InvalidTestCase<'preferCancCombinator' | 'suggestUseCancelablePromise', []>[];
} = {
  valid: [
    `Promise.all([Promise.resolve(1), Promise.resolve(2)]);`,
    `Promise.race([Promise.resolve(1)]);`,
    `Promise.any([Promise.resolve(1)]);`,
    `Promise.allSettled([Promise.resolve(1)]);`,
    `import { CancelablePromise } from '@cancjs/promise';
Promise.resolve(new CancelablePromise(() => {}));`,
    `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.all([new CancelablePromise(() => {})]);`,
    `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.race([new CancelablePromise(() => {})]);`,
    `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.allSettled([new CancelablePromise(() => {})]);`,
    `Promise.race([]);`,
    `import { CancelablePromise } from '@cancjs/promise';
const P = Promise;
P.all([new CancelablePromise(() => {})]);`,
    `import { CancelablePromise } from '@cancjs/promise';
class Promise {
  static all(x: any) {}
}
Promise.all([new CancelablePromise(() => {})]);`,
  ],
  invalid: [
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
Promise.all([new CancelablePromise(() => {})]);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.all([new CancelablePromise(() => {})]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'all' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
Promise.race([new CancelablePromise(() => {})]);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.race([new CancelablePromise(() => {})]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'race' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
Promise.any([new CancelablePromise(() => {})]);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.any([new CancelablePromise(() => {})]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'any' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
Promise.allSettled([new CancelablePromise(() => {})]);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.allSettled([new CancelablePromise(() => {})]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'allSettled' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
Promise.all([Promise.resolve(1), new CancelablePromise(() => {})]);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
CancelablePromise.all([Promise.resolve(1), new CancelablePromise(() => {})]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'all' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
const cancs = [new CancelablePromise(() => {})];
Promise.all([...cancs]);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
const cancs = [new CancelablePromise(() => {})];
CancelablePromise.all([...cancs]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'all' },
          line: 3,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
const cancs = [new CancelablePromise(() => {})];
Promise.all(cancs);`,
      output: `import { CancelablePromise } from '@cancjs/promise';
const cancs = [new CancelablePromise(() => {})];
CancelablePromise.all(cancs);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'all' },
          line: 3,
          column: 1,
        },
      ],
    },
    {
      code: `import { CancelablePromise as CP } from '@cancjs/promise';
Promise.all([new CP(() => {})]);`,
      output: `import { CancelablePromise as CP } from '@cancjs/promise';
CP.all([new CP(() => {})]);`,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'all' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `declare const p: import('@cancjs/promise').CancelablePromise<number>;
Promise.all([p]);`,
      output: null,
      errors: [
        {
          messageId: 'preferCancCombinator',
          data: { method: 'all' },
          line: 2,
          column: 1,
          suggestions: [
            {
              messageId: 'suggestUseCancelablePromise',
              data: { method: 'all' },
              output: `declare const p: import('@cancjs/promise').CancelablePromise<number>;
CancelablePromise.all([p]);`,
            },
          ],
        },
      ],
    },
  ],
};

describe('canc/prefer-canc-combinators', () => {
  ruleTester({ types: true }).run('prefer-canc-combinators-typed', rule, testCases);

  ruleTester({ types: false }).run('prefer-canc-combinators-untyped-silent', rule, {
    valid: [
      `import { CancelablePromise } from '@cancjs/promise';
Promise.all([new CancelablePromise(() => {})]);`,
      `import { CancelablePromise } from '@cancjs/promise';
Promise.race([new CancelablePromise(() => {})]);`,
      `declare const p: import('@cancjs/promise').CancelablePromise<number>;
Promise.all([p]);`,
    ],
    invalid: [],
  });
});

describe('prefer-canc-combinators typed corpus lane', () => {
  it('passes corpus flow twins via createTypedCorpusLinter', async () => {
    (plugin.rules as Record<string, unknown>)['prefer-canc-combinators'] = rule;

    const linter = createTypedCorpusLinter([
      {
        rules: {
          'canc/prefer-canc-combinators': 'error',
        },
      },
    ]);

    const results = await linter.lintFiles([
      invalid06Path,
      invalid07Path,
      invalid10Path,
      valid11Path,
      valid12Path,
      valid13Path,
      valid20Path,
    ]);

    for (const r of results) {
      const relPath = path.basename(r.filePath);
      if (relPath.includes('valid')) {
        expect(r.messages).toEqual([]);
      } else {
        const markers = readMarkers(r.filePath);
        expect(r.messages).toHaveLength(markers.length);
        for (let i = 0; i < markers.length; i++) {
          expect(r.messages[i]?.line).toBe(markers[i]?.line);
          expect(r.messages[i]?.ruleId).toBe('canc/prefer-canc-combinators');
        }
      }
    }
  });
});
