import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { ESLint, type Rule } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/executor-cancel-wiring.js';
import rule from '../../src/rules/executor-cancel-wiring.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid08Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/08-executor-cancel-wiring.ts');

const valid10Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/10-executor-cancel-wiring.ts');
const valid11Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/11-executor-cancel-wiring-acknowledged-leak.ts',
);
const valid28Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/28-executor-cancel-wiring-getsignal.ts');

const codeInvalid08 = fs.readFileSync(invalid08Path, 'utf8');

const codeValid10 = fs.readFileSync(valid10Path, 'utf8');
const codeValid28 = fs.readFileSync(valid28Path, 'utf8');

const markers08 = readMarkers(invalid08Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  handleCancel(() => {});
  fetchProfile('user-1').then(resolve, reject);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(url: string, opts?: { signal?: AbortSignal }): Promise<void>;
new CancelablePromise((resolve, reject, { getSignal }) => {
  fetchProfile('/api/user', { signal: getSignal() }).then(resolve, reject);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(url: string, opts?: { signal?: AbortSignal }): Promise<void>;
new CancelablePromise((resolve, reject, ctx) => {
  fetchProfile('/api/user', { signal: ctx.getSignal() }).then(resolve, reject);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
declare const signal: AbortSignal;
new CancelablePromise((resolve, reject) => {
  fetchProfile('user-1').then(resolve, reject);
}, { signal });`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
declare const ref: unknown;
new CancelablePromise((resolve, reject) => {
  fetchProfile('user-1').then(resolve, reject);
}, { ref });`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve) => {
  resolve(42);
});`,
    `import { LazyPromise } from '@cancjs/toolbox';
declare function openSocket(): { close(): void };
new LazyPromise((resolve) => {
  const s = openSocket();
  return () => s.close();
});`,
    `declare function fetchProfile(userId: string): Promise<void>;
new Promise((resolve, reject) => {
  fetchProfile('user-1').then(resolve, reject);
});`,
    codeValid10,
    codeValid28,
  ],
  invalid: [
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject) => {
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'noCancelWiring' as const,
          line: 3,
          column: 23,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise(function(resolve, reject) {
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'noCancelWiring' as const,
          line: 3,
          column: 23,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject, ctx) => {
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'noCancelWiring' as const,
          line: 3,
          column: 23,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject) => {
  (async () => {
    await fetchProfile('user-1');
    resolve();
  })();
});`,
      errors: [
        {
          messageId: 'noCancelWiring' as const,
          line: 3,
          column: 23,
        },
      ],
    },
    {
      code: codeInvalid08,
      errors: [
        {
          messageId: (markers08[0]?.messageId ?? 'noCancelWiring') as MessageIds,
          line: markers08[0].line,
          column: 48,
        },
      ],
    },
  ],
};

describe('executor-cancel-wiring (untyped)', () => {
  ruleTester({ types: false }).run('executor-cancel-wiring', rule, testCases);
});

describe('executor-cancel-wiring (typed twin)', () => {
  ruleTester({ types: true }).run('executor-cancel-wiring', rule, testCases);
});

describe('executor-cancel-wiring direct valid fixtures', () => {
  const validFiles = corpusFiles('executor', 'valid').filter(
    (f) =>
      !f.endsWith('09-require-signal-forwarding-no-controller.ts') &&
      !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('executor-cancel-wiring-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });

  it('suppresses acknowledged leak in fixture 11 via eslint-disable-next-line', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tseslintParser,
          },
          plugins: { canc: { rules: { 'executor-cancel-wiring': rule as unknown as Rule.RuleModule } } },
          rules: { 'canc/executor-cancel-wiring': 'error' },
        },
      ],
    });
    const results = await eslint.lintFiles([valid11Path]);
    expect(results[0]?.messages).toEqual([]);
  });
});
