import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import type { Rule } from 'eslint';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/no-multistep-executor.js';
import rule from '../../src/rules/no-multistep-executor.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid03Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/03-no-multistep-executor.ts');
const invalid04Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/04-no-multistep-executor-iife.ts');
const markers03 = readMarkers(invalid03Path);
const markers04 = readMarkers(invalid04Path);

const IMPORT = "import CancelablePromise from '@cancjs/promise';";

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    {
      name: 'single operation forwarded with then',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchData().then(resolve, reject);
});`,
    },
    {
      name: 'operation inside a handleCancel callback does not count',
      code: `${IMPORT}
new CancelablePromise((resolve, reject, { handleCancel }) => {
  handleCancel(() => {
    notifyServer().then(log);
  });
  fetchData().then(resolve, reject);
});`,
    },
    {
      name: 'operation inside a ctx.handleCancel callback does not count',
      code: `${IMPORT}
new CancelablePromise((resolve, reject, ctx) => {
  ctx.handleCancel(() => {
    notifyServer().then(log);
  });
  fetchData().then(resolve, reject);
});`,
    },
    {
      name: 'operation inside an uninvoked nested function declaration does not count',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  function fallback() {
    return loadCache().then(resolve, reject);
  }
  fetchData().then(resolve, reject);
});`,
    },
    {
      name: 'resolve, reject and getSignal calls are not operations',
      code: `${IMPORT}
new CancelablePromise((resolve, reject, { getSignal }) => {
  fetchData(getSignal()).then(() => resolve(), (error) => reject(error));
});`,
    },
    {
      name: 'resolve with a single operation',
      code: `${IMPORT}
new CancelablePromise((resolve) => {
  resolve(op());
});`,
    },
    {
      name: 'maxOperations 2 allows two starts',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  stepOne().then(() => stepTwo()).then(resolve, reject);
});`,
      options: [{ maxOperations: 2 }],
    },
    {
      name: 'a step consuming the previous result continues the same operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  openStream().then((stream) => readAll(stream)).then(resolve, reject);
});`,
    },
    {
      name: 'a three step chain where each step consumes the previous result is one operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  openStream().then((stream) => readAll(stream)).then((text) => parse(text)).then(resolve, reject);
});`,
    },
    {
      name: 'a nested property read of the previous result counts as consuming it',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  createSession().then((session) => loadProfile(session.id)).then(resolve, reject);
});`,
    },
    {
      name: 'a conditional reading the previous result counts as consuming it',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  pick().then((first) => load(ok ? first : fallback)).then(resolve, reject);
});`,
    },
    {
      name: 'an object pattern binding read by the next step is one operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  op().then(({ length }) => op2(String(length))).then(resolve, reject);
});`,
    },
    {
      name: 'an array pattern binding read by the next step is one operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  op().then(([first]) => op2(first)).then(resolve, reject);
});`,
    },
    {
      name: 'a defaulted pattern binding read by the next step is one operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  op().then(({ id = 0 }) => op2(id)).then(resolve, reject);
});`,
    },
    {
      name: 'untracked constructor is ignored',
      code: `new Promise((resolve, reject) => {
  stepOne().then(() => stepTwo()).then(resolve, reject);
});`,
    },
  ],
  invalid: [
    {
      name: 'corpus: chained second operation reported at the second start',
      code: fs.readFileSync(invalid03Path, 'utf8'),
      errors: [{ messageId: 'multipleOperations', line: markers03[0].line + 1, column: 15, data: { count: 2 } }],
    },
    {
      name: 'corpus: two awaited operations in an async wrapper',
      code: fs.readFileSync(invalid04Path, 'utf8'),
      errors: [{ messageId: 'multipleOperations', line: markers04[1].line, column: 9, data: { count: 2 } }],
    },
    {
      name: 'parallel operations count',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  loadUser().then(resolve, reject);
  loadPosts().then(resolve, reject);
});`,
      errors: [{ messageId: 'multipleOperations', line: 4, column: 3, data: { count: 2 } }],
    },
    {
      name: 'retry calling the same function twice counts as two starts',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  fetchData().then(resolve, () => fetchData().then(resolve, reject));
});`,
      errors: [{ messageId: 'multipleOperations', line: 3, column: 35, data: { count: 2 } }],
    },
    {
      name: 'resolve with a second call result is a second start',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  first().then(() => resolve(second()), reject);
});`,
      errors: [{ messageId: 'multipleOperations', line: 3, column: 30, data: { count: 2 } }],
    },
    {
      name: 'resolve with a cast second call result is a second start',
      code: `${IMPORT}
new CancelablePromise<number>((resolve, reject) => {
  op().then(() => resolve(op2() as unknown as number), reject);
});`,
      errors: [{ messageId: 'multipleOperations' }],
    },
    {
      name: 'invoked nested function declaration counts',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  function more() {
    return loadMore().then(resolve, reject);
  }
  fetchData().then(more, reject);
  more();
});`,
      errors: [{ messageId: 'multipleOperations', line: 6, column: 3, data: { count: 2 } }],
    },
    {
      name: 'a mixed chain is reported at the first step that ignores the previous result',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  openStream().then((stream) => readAll(stream)).then(() => chargeCard()).then(resolve, reject);
});`,
      errors: [{ messageId: 'multipleOperations', line: 3, column: 61, data: { count: 2 } }],
    },
    {
      name: 'the awaited form of a data dependent sequence is reported',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  (async () => {
    const stream = await openStream();
    const text = await readAll(stream);
    resolve(text);
  })().catch(reject);
});`,
      errors: [{ messageId: 'multipleOperations', line: 5, column: 24, data: { count: 2 } }],
    },
    {
      name: 'a callback that does not read its parameter is a new operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  pick().then((first) => charge(ok ? 1 : 2)).then(resolve, reject);
});`,
      errors: [{ messageId: 'multipleOperations', line: 3, column: 26, data: { count: 2 } }],
    },
    {
      name: 'maxOperations 2 reports the third start',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  stepOne().then(() => stepTwo()).then(() => stepThree()).then(resolve, reject);
});`,
      options: [{ maxOperations: 2 }],
      errors: [{ messageId: 'multipleOperations', line: 3, column: 46, data: { count: 3 } }],
    },
    {
      name: 'a pattern binding the next step never reads is a new operation',
      code: `${IMPORT}
new CancelablePromise((resolve, reject) => {
  op().then(({ length }) => op2(5)).then(resolve, reject);
});`,
      errors: [{ messageId: 'multipleOperations', line: 3, column: 29, data: { count: 2 } }],
    },
  ],
};

describe('no-multistep-executor (untyped)', () => {
  ruleTester({ types: false }).run('no-multistep-executor', rule, testCases);
});

describe('no-multistep-executor (typed twin)', () => {
  ruleTester({ types: true }).run('no-multistep-executor', rule, testCases);
});

describe('no-multistep-executor options schema', () => {
  const verify = (options: unknown): Linter.LintMessage[] =>
    new Linter({ configType: 'flat' }).verify('const x = 1;', {
      plugins: { canc: { rules: { 'no-multistep-executor': rule as unknown as Rule.RuleModule } } },
      rules: { 'canc/no-multistep-executor': ['warn', options] as Linter.RuleEntry },
    });

  it('accepts maxOperations 1', () => {
    expect(verify({ maxOperations: 1 })).toEqual([]);
  });

  it('rejects maxOperations below 1', () => {
    expect(() => verify({ maxOperations: 0 })).toThrow(/Value 0 should be >= 1/);
  });

  it('rejects a non-integer maxOperations', () => {
    expect(() => verify({ maxOperations: 1.5 })).toThrow(/should be integer/);
  });
});

describe('no-multistep-executor cross-family valid fixtures', () => {
  const validFiles = ['executor', 'lazy', 'flow', 'coroutine'].flatMap((family) => corpusFiles(family, 'valid'));
  ruleTester({ types: false }).run('no-multistep-executor-valid-fixtures', rule, {
    valid: validFiles.map((file) => ({ name: path.basename(file), code: fs.readFileSync(file, 'utf8') })),
    invalid: [],
  });
});
