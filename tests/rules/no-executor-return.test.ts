import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/no-executor-return.js';
import rule from '../../src/rules/no-executor-return.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid09Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/09-no-executor-return-value.ts');
const invalid10Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/10-no-executor-return-arrow-shorthand.ts',
);
const invalid11Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/11-no-executor-return-function-non-lazy.ts',
);
const lazyInvalid04Path = path.resolve(__dirname, '../fixtures/corpus/lazy/invalid/04-lazy-executor-value-return.ts');

const valid12Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/12-no-executor-return-no-return.ts');
const valid13Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/13-no-executor-return-bare-return.ts');
const valid14Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/14-no-executor-return-lazy-teardown.ts');
const lazyValid03Path = path.resolve(__dirname, '../fixtures/corpus/lazy/valid/03-lazy-executor-teardown-function.ts');
const lazyValid04Path = path.resolve(__dirname, '../fixtures/corpus/lazy/valid/04-lazy-executor-handlecancel.ts');

const codeInvalid09 = fs.readFileSync(invalid09Path, 'utf8');
const codeInvalid10 = fs.readFileSync(invalid10Path, 'utf8');
const codeInvalid11 = fs.readFileSync(invalid11Path, 'utf8');
const codeLazyInvalid04 = fs.readFileSync(lazyInvalid04Path, 'utf8');

const codeValid12 = fs.readFileSync(valid12Path, 'utf8');
const codeValid13 = fs.readFileSync(valid13Path, 'utf8');
const codeValid14 = fs.readFileSync(valid14Path, 'utf8');
const codeLazyValid03 = fs.readFileSync(lazyValid03Path, 'utf8');
const codeLazyValid04 = fs.readFileSync(lazyValid04Path, 'utf8');

const markers09 = readMarkers(invalid09Path);
const markers10 = readMarkers(invalid10Path);
const markers11 = readMarkers(invalid11Path);
const markersLazy04 = readMarkers(lazyInvalid04Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    "import CancelablePromise from '@cancjs/promise'; new CancelablePromise((resolve, reject) => { resolve(1); });",
    "import CancelablePromise from '@cancjs/promise'; new CancelablePromise((resolve, reject) => { return; });",
    {
      code: "import CancelablePromise from '@cancjs/promise'; new CancelablePromise((resolve, reject) => void resolve(1));",
      options: [{ allowVoid: true }],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise'; new CancelablePromise((resolve, reject) => { return void resolve(1); });",
      options: [{ allowVoid: true }],
    },
    "import { LazyPromise } from '@cancjs/toolbox'; new LazyPromise((resolve, reject) => { return () => {}; });",
    "import { LazyPromise } from '@cancjs/toolbox'; new LazyPromise((resolve, reject) => () => {});",
    "import CancelablePromise from '@cancjs/promise'; new CancelablePromise((resolve, reject) => { [1, 2].map((x) => { return x * 2; }); });",
    'new Promise((resolve, reject) => { return 1; });',
    'new Promise((resolve, reject) => resolve(1));',
    codeValid12,
    codeValid13,
    codeValid14,
    codeLazyValid03,
    codeLazyValid04,
  ],
  invalid: [
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => {\n  return 1;\n});",
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: 3,
          column: 10,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => resolve(1));",
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: 2,
          column: 44,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => {\n  return void resolve(1);\n});",
      options: [{ allowVoid: false }],
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: 3,
          column: 10,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => void resolve(1));",
      options: [{ allowVoid: false }],
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: 2,
          column: 44,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => {\n  return () => {};\n});",
      errors: [
        {
          messageId: 'returnsFunctionNonLazy' as const,
          line: 3,
          column: 10,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => () => {});",
      errors: [
        {
          messageId: 'returnsFunctionNonLazy' as const,
          line: 2,
          column: 44,
        },
      ],
    },
    {
      code: "import { LazyPromise } from '@cancjs/toolbox';\nnew LazyPromise((resolve, reject) => {\n  return 1;\n});",
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: 3,
          column: 10,
        },
      ],
    },
    {
      code: "import { LazyPromise } from '@cancjs/toolbox';\nnew LazyPromise((resolve, reject) => resolve(1));",
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: 2,
          column: 38,
        },
      ],
    },
    {
      code: codeInvalid09,
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: markers09[0].line,
          column: 10,
        },
      ],
    },
    {
      code: codeInvalid10,
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: markers10[0].line,
          column: 72,
        },
      ],
    },
    {
      code: codeInvalid11,
      errors: [
        {
          messageId: 'returnsFunctionNonLazy' as const,
          line: markers11[0].line,
          column: 10,
        },
      ],
    },
    {
      code: codeLazyInvalid04,
      errors: [
        {
          messageId: 'returnsValue' as const,
          line: markersLazy04[0].line,
          column: 10,
        },
      ],
    },
  ],
};

describe('no-executor-return (untyped)', () => {
  ruleTester({ types: false }).run('no-executor-return', rule, testCases);
});

describe('no-executor-return (typed twin)', () => {
  ruleTester({ types: true }).run('no-executor-return', rule, testCases);
});

describe('no-executor-return direct valid fixtures', () => {
  const validFiles = [...corpusFiles('executor', 'valid'), ...corpusFiles('lazy', 'valid')].filter(
    (f) => !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('no-executor-return-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });
});
