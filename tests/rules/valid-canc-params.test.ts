import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/valid-canc-params.js';
import rule from '../../src/rules/valid-canc-params.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid14Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/14-valid-canc-params-all-no-args.ts',
);
const invalid15Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/15-valid-canc-params-all-extra-args.ts',
);
const invalid16Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/16-valid-canc-params-try-no-args.ts',
);
const invalid17Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/17-valid-canc-params-withresolvers-extra-args.ts',
);
const invalid18Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/18-valid-canc-params-then-extra-args.ts',
);
const invalid19Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/19-valid-canc-params-handlecancel-no-args.ts',
);
const invalid20Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/20-valid-canc-params-try-options-no-fn.ts',
);

const valid18Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/18-valid-canc-params-all-options.ts');
const valid19Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/19-valid-canc-params-try-args.ts');
const valid20Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/20-valid-canc-params-try-options-fn.ts');
const valid21Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/21-valid-canc-params-resolve-no-args.ts',
);
const valid22Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/22-valid-canc-params-reject-options.ts');
const valid23Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/23-valid-canc-params-finally-fn.ts');
const valid24Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/24-valid-canc-params-handlecancel-options.ts',
);

const codeInvalid14 = fs.readFileSync(invalid14Path, 'utf8');
const codeInvalid15 = fs.readFileSync(invalid15Path, 'utf8');
const codeInvalid16 = fs.readFileSync(invalid16Path, 'utf8');
const codeInvalid17 = fs.readFileSync(invalid17Path, 'utf8');
const codeInvalid18 = fs.readFileSync(invalid18Path, 'utf8');
const codeInvalid19 = fs.readFileSync(invalid19Path, 'utf8');
const codeInvalid20 = fs.readFileSync(invalid20Path, 'utf8');

const codeValid18 = fs.readFileSync(valid18Path, 'utf8');
const codeValid19 = fs.readFileSync(valid19Path, 'utf8');
const codeValid20 = fs.readFileSync(valid20Path, 'utf8');
const codeValid21 = fs.readFileSync(valid21Path, 'utf8');
const codeValid22 = fs.readFileSync(valid22Path, 'utf8');
const codeValid23 = fs.readFileSync(valid23Path, 'utf8');
const codeValid24 = fs.readFileSync(valid24Path, 'utf8');

const markers14 = readMarkers(invalid14Path);
const markers15 = readMarkers(invalid15Path);
const markers16 = readMarkers(invalid16Path);
const markers17 = readMarkers(invalid17Path);
const markers18 = readMarkers(invalid18Path);
const markers19 = readMarkers(invalid19Path);
const markers20 = readMarkers(invalid20Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    // all: 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.all([Promise.resolve(1)]);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.all([Promise.resolve(1)], { signal: new AbortController().signal });`,

    // race: 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.race([Promise.resolve(1)]);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.race([Promise.resolve(1)], { signal: new AbortController().signal });`,

    // any: 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.any([Promise.resolve(1)]);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.any([Promise.resolve(1)], { signal: new AbortController().signal });`,

    // allSettled: 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.allSettled([Promise.resolve(1)]);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.allSettled([Promise.resolve(1)], { signal: new AbortController().signal });`,

    // resolve: 0 args, 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.resolve();`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.resolve(1);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.resolve(1, { signal: new AbortController().signal });`,

    // reject: 0 args, 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.reject();`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.reject(new Error('fail'));`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.reject(new Error('fail'), { signal: new AbortController().signal });`,

    // withResolvers: 0 args, 1 arg
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.withResolvers();`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.withResolvers({ signal: new AbortController().signal });`,

    // try: try(fn), try(fn, 1, 2), try({ signal }, fn), try({ signal }, fn, 1, 2)
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.try(() => 1);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.try((a, b) => a + b, 1, 2);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.try({ signal: new AbortController().signal }, () => 1);`,
    `import CancelablePromise from '@cancjs/promise';
CancelablePromise.try({ signal: new AbortController().signal }, (a, b) => a + b, 1, 2);`,

    // then: 0 args, 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.then();`,
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.then((v) => v);`,
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.then((v) => v, (err) => err);`,

    // catch: 0 args, 1 arg
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.catch();`,
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.catch((err) => err);`,

    // finally: 0 args, 1 arg
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.finally();`,
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.finally(() => {});`,

    // handleCancel: 1 arg, 2 args
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.handleCancel(() => {});`,
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.handleCancel(() => {}, { immediate: true });`,

    // spread calls: unknown arity, ignored
    `import CancelablePromise from '@cancjs/promise';
declare const args: unknown[];
CancelablePromise.all(...args);`,
    `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
declare const args: unknown[];
p.then(...args);`,

    // untracked calls: ignored
    `Promise.all();`,
    `declare function fetch(): Promise<unknown>;
fetch().then(1, 2, 3);`,
    `const other = { then(a: unknown, b: unknown, c: unknown) {} };
other.then(1, 2, 3);`,

    // LazyPromise static and instance calls
    `import { LazyPromise } from '@cancjs/toolbox';
LazyPromise.all([Promise.resolve(1)]);`,
    `import { LazyPromise } from '@cancjs/toolbox';
const lp = new LazyPromise((resolve) => resolve(1));
lp.then((v) => v);`,

    // renamed and namespace imports
    `import { CancelablePromise as CP } from '@cancjs/promise';
CP.all([Promise.resolve(1)]);`,
    `import * as canc from '@cancjs/promise';
canc.CancelablePromise.all([Promise.resolve(1)]);`,

    // chained static calls as instance receiver
    `import CancelablePromise from '@cancjs/promise';
const onFulfilled = () => {};
CancelablePromise.resolve(1).then(onFulfilled);`,

    // Corpus valid fixtures
    codeValid18,
    codeValid19,
    codeValid20,
    codeValid21,
    codeValid22,
    codeValid23,
    codeValid24,
  ],
  invalid: [
    // all: 0 args (tooFew), 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.all();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.all', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.all([], {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.all', max: 2 },
          line: 2,
          column: 31,
        },
      ],
    },

    // race: 0 args (tooFew), 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.race();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.race', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.race([], {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.race', max: 2 },
          line: 2,
          column: 32,
        },
      ],
    },

    // any: 0 args (tooFew), 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.any();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.any', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.any([], {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.any', max: 2 },
          line: 2,
          column: 31,
        },
      ],
    },

    // allSettled: 0 args (tooFew), 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.allSettled();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.allSettled', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.allSettled([], {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.allSettled', max: 2 },
          line: 2,
          column: 38,
        },
      ],
    },

    // resolve: 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.resolve(1, {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.resolve', max: 2 },
          line: 2,
          column: 34,
        },
      ],
    },

    // reject: 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.reject('err', {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.reject', max: 2 },
          line: 2,
          column: 37,
        },
      ],
    },

    // withResolvers: 2 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.withResolvers({}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.withResolvers', max: 1 },
          line: 2,
          column: 37,
        },
      ],
    },

    // try: 0 args (tooFew), try({ signal }) (invalidArgumentShape)
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.try();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.try', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
CancelablePromise.try({ signal: new AbortController().signal });`,
      errors: [
        {
          messageId: 'invalidArgumentShape',
          data: { callee: 'CancelablePromise.try', expected: 'a function after the options' },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
const controller = new AbortController();
CancelablePromise.try({ signal: controller.signal }, 123);`,
      errors: [
        {
          messageId: 'invalidArgumentShape',
          data: { callee: 'CancelablePromise.try', expected: 'a function after the options' },
          line: 3,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
const controller = new AbortController();
CancelablePromise.try({ signal: controller.signal }, {});`,
      errors: [
        {
          messageId: 'invalidArgumentShape',
          data: { callee: 'CancelablePromise.try', expected: 'a function after the options' },
          line: 3,
          column: 1,
        },
      ],
    },

    // then: 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.then(() => {}, () => {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'p.then', max: 2 },
          line: 3,
          column: 28,
        },
      ],
    },

    // catch: 2 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.catch(() => {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'p.catch', max: 1 },
          line: 3,
          column: 19,
        },
      ],
    },

    // finally: 2 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.finally(() => {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'p.finally', max: 1 },
          line: 3,
          column: 21,
        },
      ],
    },

    // handleCancel: 0 args (tooFew), 3 args (tooMany)
    {
      code: `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.handleCancel();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'p.handleCancel', min: 1 },
          line: 3,
          column: 1,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
const p = new CancelablePromise((resolve) => resolve(1));
p.handleCancel(() => {}, {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'p.handleCancel', max: 2 },
          line: 3,
          column: 30,
        },
      ],
    },

    // LazyPromise static and instance errors
    {
      code: `import { LazyPromise } from '@cancjs/toolbox';
LazyPromise.all();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'LazyPromise.all', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import { LazyPromise } from '@cancjs/toolbox';
const lp = new LazyPromise((resolve) => resolve(1));
lp.catch(() => {}, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'lp.catch', max: 1 },
          line: 3,
          column: 20,
        },
      ],
    },

    // renamed and namespace import errors
    {
      code: `import { CancelablePromise as CP } from '@cancjs/promise';
CP.all();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CP.all', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },
    {
      code: `import * as canc from '@cancjs/promise';
canc.CancelablePromise.all();`,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'canc.CancelablePromise.all', min: 1 },
          line: 2,
          column: 1,
        },
      ],
    },

    // chained static call as instance receiver errors
    {
      code: `import CancelablePromise from '@cancjs/promise';
const onFulfilled = () => {};
const onRejected = () => {};
CancelablePromise.resolve(1).then(onFulfilled, onRejected, 'extra');`,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.resolve(1).then', max: 2 },
          line: 4,
          column: 60,
        },
      ],
    },

    // Corpus invalid fixtures
    {
      code: codeInvalid14,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.all', min: 1 },
          line: markers14[0].line,
          column: 1,
        },
      ],
    },
    {
      code: codeInvalid15,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.all', max: 2 },
          line: markers15[0].line,
          column: 36,
        },
      ],
    },
    {
      code: codeInvalid16,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'CancelablePromise.try', min: 1 },
          line: markers16[0].line,
          column: 1,
        },
      ],
    },
    {
      code: codeInvalid17,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'CancelablePromise.withResolvers', max: 1 },
          line: markers17[0].line,
          column: 37,
        },
      ],
    },
    {
      code: codeInvalid18,
      errors: [
        {
          messageId: 'tooManyArguments',
          data: { callee: 'cancPromise.then', max: 2 },
          line: markers18[0].line,
          column: 43,
        },
      ],
    },
    {
      code: codeInvalid19,
      errors: [
        {
          messageId: 'tooFewArguments',
          data: { callee: 'cancPromise.handleCancel', min: 1 },
          line: markers19[0].line,
          column: 1,
        },
      ],
    },
    {
      code: codeInvalid20,
      errors: [
        {
          messageId: 'invalidArgumentShape',
          data: { callee: 'CancelablePromise.try', expected: 'a function after the options' },
          line: markers20[0].line,
          column: 1,
        },
      ],
    },
  ],
};

describe('valid-canc-params (untyped)', () => {
  ruleTester({ types: false }).run('valid-canc-params', rule, testCases);
});

describe('valid-canc-params (typed twin)', () => {
  ruleTester({ types: true }).run('valid-canc-params', rule, testCases);
});

describe('valid-canc-params direct valid fixtures', () => {
  const validFiles = corpusFiles('executor', 'valid').filter(
    (f) => !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('valid-canc-params-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });
});
