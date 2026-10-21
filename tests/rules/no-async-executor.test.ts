import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/no-async-executor.js';
import rule from '../../src/rules/no-async-executor.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid01Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/01-no-async-executor.ts');
const invalid02Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/02-no-async-executor-iife.ts');
const invalid22Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/22-no-async-executor-destructured.ts',
);
const lazyInvalid03Path = path.resolve(__dirname, '../fixtures/corpus/lazy/invalid/03-lazy-executor-async.ts');

const valid01Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/01-no-async-executor.ts');
const valid02Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/02-no-async-executor-iife-fix.ts');

const codeInvalid01 = fs.readFileSync(invalid01Path, 'utf8');
const codeInvalid02 = fs.readFileSync(invalid02Path, 'utf8');
const codeInvalid22 = fs.readFileSync(invalid22Path, 'utf8');
const codeLazyInvalid03 = fs.readFileSync(lazyInvalid03Path, 'utf8');

const codeValid01 = fs.readFileSync(valid01Path, 'utf8');
const codeValid02 = fs.readFileSync(valid02Path, 'utf8');

const markers01 = readMarkers(invalid01Path);
const markers02 = readMarkers(invalid02Path);
const markers22 = readMarkers(invalid22Path);
const markersLazy03 = readMarkers(lazyInvalid03Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    'new Promise(async () => {});',
    'new OtherPromise(async function() {});',
    'new (getCtor())(async () => {});',
    "import CancelablePromise from '@cancjs/promise'; new CancelablePromise((resolve, reject) => { resolve(1); });",
    "import { LazyPromise } from '@cancjs/toolbox'; new LazyPromise((resolve, reject) => { resolve(1); });",
    "import CancelablePromise from '@cancjs/promise'; function exec(resolve: any, reject: any) {} new CancelablePromise(exec);",
    codeValid01,
    codeValid02,
  ],
  invalid: [
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise(async () => {});",
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: 2,
          column: 23,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise(async function(resolve, reject) {});",
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: 2,
          column: 23,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => {\n  (async () => {})();\n});",
      errors: [
        {
          messageId: 'asyncDriver' as const,
          line: 3,
          column: 3,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nnew CancelablePromise((resolve, reject) => {\n  async function run() {}\n  run();\n});",
      errors: [
        {
          messageId: 'asyncDriver' as const,
          line: 4,
          column: 3,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nasync function exec(resolve: any, reject: any) {}\nnew CancelablePromise(exec);",
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: 3,
          column: 23,
        },
      ],
    },
    {
      code: "import CancelablePromise from '@cancjs/promise';\nconst exec = async (resolve: any, reject: any) => {};\nnew CancelablePromise(exec);",
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: 3,
          column: 23,
        },
      ],
    },
    {
      code: "import { LazyPromise } from '@cancjs/toolbox';\nnew LazyPromise(async (resolve, reject) => {});",
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: 2,
          column: 17,
        },
      ],
    },
    {
      code: codeInvalid01,
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: markers01[0].line,
          column: 53,
        },
      ],
    },
    {
      code: codeInvalid02,
      errors: [
        {
          messageId: 'asyncDriver' as const,
          line: markers02[0].line,
          column: 3,
        },
      ],
    },
    {
      code: codeInvalid22,
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: markers22[0].line,
          column: 49,
        },
      ],
    },
    {
      code: codeLazyInvalid03,
      errors: [
        {
          messageId: 'asyncExecutor' as const,
          line: markersLazy03[0].line,
          column: 36,
        },
      ],
    },
  ],
};

describe('no-async-executor (untyped)', () => {
  ruleTester({ types: false }).run('no-async-executor', rule, testCases);
});

describe('no-async-executor (typed twin)', () => {
  ruleTester({ types: true }).run('no-async-executor', rule, testCases);
});

describe('no-async-executor direct valid fixtures', () => {
  const validFiles = [...corpusFiles('executor', 'valid'), ...corpusFiles('lazy', 'valid')].filter(
    (f) => !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('no-async-executor-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });
});
