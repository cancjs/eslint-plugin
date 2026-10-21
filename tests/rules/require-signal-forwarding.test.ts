import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/require-signal-forwarding.js';
import rule from '../../src/rules/require-signal-forwarding.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid07Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/07-require-signal-forwarding.ts');

const valid07Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/07-require-signal-forwarding.ts');
const valid08Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/08-require-signal-forwarding-controller.ts',
);
const valid09Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/09-require-signal-forwarding-no-controller.ts',
);
const valid26Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/26-require-signal-forwarding-getsignal.ts',
);
const valid27Path = path.resolve(
  __dirname,
  '../fixtures/corpus/executor/valid/27-require-signal-forwarding-destructured-getsignal.ts',
);

const codeInvalid07 = fs.readFileSync(invalid07Path, 'utf8');

const codeValid07 = fs.readFileSync(valid07Path, 'utf8');
const codeValid08 = fs.readFileSync(valid08Path, 'utf8');
const codeValid09 = fs.readFileSync(valid09Path, 'utf8');
const codeValid26 = fs.readFileSync(valid26Path, 'utf8');
const codeValid27 = fs.readFileSync(valid27Path, 'utf8');

const markers07 = readMarkers(invalid07Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(id: string, signal: AbortSignal): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchProfile('1', controller.signal).then(resolve, reject);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(id: string, signal: AbortSignal): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  const { signal } = controller;
  handleCancel(() => controller.abort());
  fetchProfile('1', signal).then(resolve, reject);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(id: string, controller: AbortController): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchProfile('1', controller).then(resolve, reject);
});`,
    `import CancelablePromise from '@cancjs/promise';
interface Stream { destroy(): void; }
new CancelablePromise((resolve, reject, { handleCancel }) => {
  declare const stream: Stream;
  handleCancel(() => stream.destroy());
  resolve(1);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(url: string, init?: { signal?: AbortSignal }): Promise<void>;
new CancelablePromise((resolve, reject, { getSignal }) => {
  fetchProfile('/api', { signal: getSignal() }).then(resolve, reject);
});`,
    `new Promise((resolve) => {
  const controller = new AbortController();
  resolve(controller);
});`,
    codeValid07,
    codeValid08,
    codeValid09,
    codeValid26,
    codeValid27,
  ],
  invalid: [
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'signalNotForwarded' as const,
          line: 5,
          column: 3,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject, handleCancel) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'signalNotForwarded' as const,
          line: 5,
          column: 3,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
new CancelablePromise((resolve, reject, ctx) => {
  const controller = new AbortController();
  ctx.handleCancel(() => controller.abort());
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'signalNotForwarded' as const,
          line: 5,
          column: 3,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function fetchProfile(userId: string): Promise<void>;
const controller = new AbortController();
new CancelablePromise((resolve, reject, { handleCancel }) => {
  handleCancel(() => controller.abort());
  fetchProfile('user-1').then(resolve, reject);
});`,
      errors: [
        {
          messageId: 'signalNotForwarded' as const,
          line: 5,
          column: 3,
        },
      ],
    },
    {
      code: codeInvalid07,
      errors: [
        {
          messageId: (markers07[0]?.messageId ?? 'signalNotForwarded') as MessageIds,
          line: markers07[0].line,
          column: 3,
        },
      ],
    },
  ],
};

describe('require-signal-forwarding (untyped)', () => {
  ruleTester({ types: false }).run('require-signal-forwarding', rule, testCases);
});

describe('require-signal-forwarding (typed twin)', () => {
  ruleTester({ types: true }).run('require-signal-forwarding', rule, testCases);
});

describe('require-signal-forwarding direct valid fixtures', () => {
  const validFiles = corpusFiles('executor', 'valid').filter(
    (f) => !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('require-signal-forwarding-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });
});
