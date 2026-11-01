import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { Linter, type Rule } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/executor-param-names.js';
import rule from '../../src/rules/executor-param-names.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid12Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/12-executor-param-names-abbreviated.ts',
);
const invalid13Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/invalid/13-executor-param-names-invalid-context.ts',
);

const valid15Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/15-executor-param-names-destructured-context.ts',
);
const valid16Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/16-executor-param-names-identifier-ctx.ts',
);
const valid17Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/17-executor-param-names-unused-prefixed.ts',
);

const codeInvalid12 = fs.readFileSync(invalid12Path, 'utf8');
const codeInvalid13 = fs.readFileSync(invalid13Path, 'utf8');

const codeValid15 = fs.readFileSync(valid15Path, 'utf8');
const codeValid16 = fs.readFileSync(valid16Path, 'utf8');
const codeValid17 = fs.readFileSync(valid17Path, 'utf8');

const markers12 = readMarkers(invalid12Path);
const markers13 = readMarkers(invalid13Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((_resolve, _reject) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { handleCancel, getSignal }) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, ctx) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, handleCancel) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, hc) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, _handleCancel) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, _ctx) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve) => {});`,
    `new Promise((res, rej) => {});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve = () => {}, reject = () => {}) => {});`,
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((myResolve, myReject, myContext) => {});`,
      options: [{ resolve: '^myResolve$', reject: '^myReject$', context: '^myContext$' }],
    },
    `import { LazyPromise } from '@cancjs/toolbox';
new LazyPromise((resolve, reject) => {});`,
    codeValid15,
    codeValid16,
    codeValid17,
  ],
  invalid: [
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((res, rej) => {});`,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'first', expected: 'resolve', actual: 'res' },
          line: 2,
          column: 24,
        },
        {
          messageId: 'badParamName',
          data: { position: 'second', expected: 'reject', actual: 'rej' },
          line: 2,
          column: 29,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((res, reject) => {});`,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'first', expected: 'resolve', actual: 'res' },
          line: 2,
          column: 24,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, rej) => {});`,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'second', expected: 'reject', actual: 'rej' },
          line: 2,
          column: 33,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, c) => {});`,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'third', expected: 'context', actual: 'c' },
          line: 2,
          column: 41,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, [c]) => {});`,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'third', expected: 'context', actual: 'unknown' },
          line: 2,
          column: 41,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject) => {});`,
      options: [{ resolve: '^customResolve$' }],
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'first', expected: 'resolve', actual: 'resolve' },
          line: 2,
          column: 24,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject) => {});`,
      options: [{ reject: '^customReject$' }],
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'second', expected: 'reject', actual: 'reject' },
          line: 2,
          column: 33,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, ctx) => {});`,
      options: [{ context: '^myContext$' }],
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'third', expected: 'context', actual: 'ctx' },
          line: 2,
          column: 41,
        },
      ],
    },
    {
      code: `import { LazyPromise } from '@cancjs/toolbox';
new LazyPromise((res, rej) => {});`,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'first', expected: 'resolve', actual: 'res' },
          line: 2,
          column: 18,
        },
        {
          messageId: 'badParamName',
          data: { position: 'second', expected: 'reject', actual: 'rej' },
          line: 2,
          column: 23,
        },
      ],
    },
    {
      code: codeInvalid12,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'first', expected: 'resolve', actual: 'res' },
          line: markers12[0].line,
          column: 50,
        },
        {
          messageId: 'badParamName',
          data: { position: 'second', expected: 'reject', actual: 'rej' },
          line: markers12[0].line,
          column: 55,
        },
      ],
    },
    {
      code: codeInvalid13,
      errors: [
        {
          messageId: 'badParamName',
          data: { position: 'third', expected: 'context', actual: 'c' },
          line: markers13[0].line,
          column: 67,
        },
      ],
    },
  ],
};

describe('executor-param-names (untyped)', () => {
  ruleTester({ types: false }).run('executor-param-names', rule, testCases);
});

describe('executor-param-names (typed twin)', () => {
  ruleTester({ types: true }).run('executor-param-names', rule, testCases);
});

describe('executor-param-names direct valid fixtures', () => {
  const validFiles = corpusFiles('executor', 'valid').filter(
    (f) => !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('executor-param-names-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });
});

describe('executor-param-names schema validation', () => {
  const verify = (options: unknown) =>
    new Linter().verify('const x = 1;', [
      {
        plugins: { canc: { rules: { 'executor-param-names': rule as unknown as Rule.RuleModule } } },
        rules: { 'canc/executor-param-names': ['error', options] },
      },
    ]);

  it('rejects non-string option properties', () => {
    expect(() => verify({ resolve: 123 })).toThrow(/Value 123 should be string/);
  });

  it('rejects additional unrecognized options', () => {
    expect(() => verify({ unknownOption: 'true' })).toThrow(/should NOT have additional properties/);
  });

  it('accepts valid options', () => {
    expect(() => verify({ resolve: 'res' })).not.toThrow();
  });
});
