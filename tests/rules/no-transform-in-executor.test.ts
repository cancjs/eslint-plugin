import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import type { Rule } from 'eslint';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/no-transform-in-executor.js';
import rule from '../../src/rules/no-transform-in-executor.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid05Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/05-no-transform-in-executor.ts');
const markers05 = readMarkers(invalid05Path);

const IMPORT = "import CancelablePromise from '@cancjs/promise';";

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    {
      name: 'raw result forwarded',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then((data) => resolve(data), reject);
});`,
    },
    {
      name: 'resolve passed directly to then',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then(resolve, reject);
});`,
    },
    {
      name: 'resolve with an operation result is not a transform',
      code: `${IMPORT}
new CancelablePromise((resolve) => {
  resolve(op());
});`,
    },
    {
      name: 'resolve with a literal or no value',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  ready().then(() => resolve(), reject);
  done().then(() => resolve(true), reject);
});`,
    },
    {
      name: 'property pick allowed with allowPropertyAccess',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchPage().then((data) => resolve(data.items), reject);
});`,
      options: [{ allowPropertyAccess: true }],
    },
    {
      name: 'transform in the chain after the promise',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then(resolve, reject);
}).then((data) => data.map(format));`,
    },
    {
      name: 'untracked constructor is ignored',
      code: `new Promise((resolve, reject) => {
  fetchItems().then((data) => resolve(data.map(format)), reject);
});`,
    },
  ],
  invalid: [
    {
      name: 'corpus: map before resolve, typed constructor gets no suggestion',
      code: fs.readFileSync(invalid05Path, 'utf8'),
      errors: [{ messageId: 'transformBeforeResolve', line: markers05[0].line, column: 23, suggestions: [] }],
    },
    {
      name: 'map of a then parameter offers moving the transform to the chain',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then((d) => resolve(d.map(format)), reject);
});`,
      errors: [
        {
          messageId: 'transformBeforeResolve',
          line: 3,
          column: 36,
          suggestions: [
            {
              messageId: 'moveTransformToThen',
              output: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then((d) => resolve(d), reject);
}).then((d) => d.map(format));`,
            },
          ],
        },
      ],
    },
    {
      name: 'property pick is a transform by default',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchPage().then((data) => resolve(data.items), reject);
});`,
      errors: [
        {
          messageId: 'transformBeforeResolve',
          line: 3,
          column: 38,
          suggestions: [
            {
              messageId: 'moveTransformToThen',
              output: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchPage().then((data) => resolve(data), reject);
}).then((data) => data.items);`,
            },
          ],
        },
      ],
    },
    {
      name: 'computed pick is a transform even with allowPropertyAccess',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchPage().then((data) => resolve(data[0]), reject);
});`,
      options: [{ allowPropertyAccess: true }],
      errors: [
        {
          messageId: 'transformBeforeResolve',
          line: 3,
          column: 38,
          suggestions: [
            {
              messageId: 'moveTransformToThen',
              output: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchPage().then((data) => resolve(data), reject);
}).then((data) => data[0]);`,
            },
          ],
        },
      ],
    },
    {
      name: 'no suggestion when the promise is the object of a member expression',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then((d) => resolve(d.map(format)), reject);
}).catch(report);`,
      errors: [{ messageId: 'transformBeforeResolve', line: 3, column: 36, suggestions: [] }],
    },
    {
      name: 'no suggestion when the executor calls resolve twice',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchItems().then((d) => resolve(d.map(format)), () => resolve([]));
});`,
      errors: [
        { messageId: 'transformBeforeResolve', line: 3, column: 36, suggestions: [] },
        { messageId: 'transformBeforeResolve', line: 3, column: 66, suggestions: [] },
      ],
    },
    {
      name: 'no suggestion when the transform reads executor locals',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  const prefix = 'item';
  fetchItems().then((d) => resolve(d.map((x) => prefix + x)), reject);
});`,
      errors: [{ messageId: 'transformBeforeResolve', line: 4, column: 36, suggestions: [] }],
    },
    {
      name: 'no suggestion outside a then callback',
      code: `${IMPORT}
new CancelablePromise((resolve) => {
  resolve(cached.map(format));
});`,
      errors: [{ messageId: 'transformBeforeResolve', line: 3, column: 11, suggestions: [] }],
    },
  ],
};

describe('no-transform-in-executor (untyped)', () => {
  ruleTester({ types: false }).run('no-transform-in-executor', rule, testCases);
});

describe('no-transform-in-executor (typed twin)', () => {
  ruleTester({ types: true }).run('no-transform-in-executor', rule, testCases);
});

describe('no-transform-in-executor options schema', () => {
  const verify = (options: unknown): Linter.LintMessage[] =>
    new Linter({ configType: 'flat' }).verify('const x = 1;', {
      plugins: { canc: { rules: { 'no-transform-in-executor': rule as unknown as Rule.RuleModule } } },
      rules: { 'canc/no-transform-in-executor': ['warn', options] as Linter.RuleEntry },
    });

  it('accepts allowPropertyAccess', () => {
    expect(verify({ allowPropertyAccess: true })).toEqual([]);
  });

  it('rejects unknown options', () => {
    expect(() => verify({ allowCalls: true })).toThrow(/additional properties/);
  });
});

describe('no-transform-in-executor cross-family valid fixtures', () => {
  const validFiles = ['executor', 'lazy', 'flow', 'coroutine'].flatMap((family) => corpusFiles(family, 'valid'));
  ruleTester({ types: false }).run('no-transform-in-executor-valid-fixtures', rule, {
    valid: validFiles.map((file) => ({ name: path.basename(file), code: fs.readFileSync(file, 'utf8') })),
    invalid: [],
  });
});
