import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe } from 'vitest';

import type { MessageIds, RuleOptions } from '../../src/rules/handle-cancel-first.js';
import rule from '../../src/rules/handle-cancel-first.js';
import { corpusFiles, readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid06Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/06-handle-cancel-first.ts');
const invalid21Path = path.resolve(__dirname, '../fixtures/corpus/executor/invalid/21-handle-cancel-first-ctx-then.ts');

const valid06Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/06-handle-cancel-first.ts');
const valid25Path = path.resolve(__dirname, '../fixtures/corpus/executor/valid/25-handle-cancel-first-destructured.ts');

const codeInvalid06 = fs.readFileSync(invalid06Path, 'utf8');
const codeInvalid21 = fs.readFileSync(invalid21Path, 'utf8');

const codeValid06 = fs.readFileSync(valid06Path, 'utf8');
const codeValid25 = fs.readFileSync(valid25Path, 'utf8');

const markers06 = readMarkers(invalid06Path);
const markers21 = readMarkers(invalid21Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { handleCancel }) => {
  handleCancel(() => {});
});`,
    `import CancelablePromise from '@cancjs/promise';
declare const condition: boolean;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  if (condition) {
    handleCancel(() => {});
  }
});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { handleCancel }) => {
  handleCancel(() => {});
  resolve(1);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function wire(hc: unknown): void;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  wire(handleCancel);
});`,
    `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, { getSignal }) => {
  openStream().then(() => {
    const signal = getSignal();
    resolve(signal);
  });
});`,
    `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject) => {
  resolve(1);
});`,
    codeValid06,
    codeValid25,
  ],
  invalid: [
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  openStream().then(() => {
    handleCancel(() => {});
  });
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 5,
          column: 5,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, ctx) => {
  openStream().then(() => {
    ctx.handleCancel(() => {});
  });
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 5,
          column: 5,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel: hc }) => {
  openStream().then(() => {
    hc(() => {});
  });
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 5,
          column: 5,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
new CancelablePromise((resolve, reject, { handleCancel }) => {
  setTimeout(() => {
    handleCancel(() => {});
  }, 100);
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 4,
          column: 5,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  async function run() {
    await openStream();
    handleCancel(() => {});
  }
  run();
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 6,
          column: 5,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, { handleCancel }) => {
  const run = async () => {
    await openStream();
    handleCancel(() => {});
  };
  run();
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 6,
          column: 5,
        },
      ],
    },
    {
      code: `import CancelablePromise from '@cancjs/promise';
declare function openStream(): Promise<void>;
new CancelablePromise((resolve, reject, handleCancel) => {
  openStream().then(() => {
    handleCancel(() => {});
  });
});`,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: 5,
          column: 5,
        },
      ],
    },
    {
      code: codeInvalid06,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: markers06[0].line,
          column: 3,
        },
      ],
    },
    {
      code: codeInvalid21,
      errors: [
        {
          messageId: 'lateRegistration' as const,
          line: markers21[0].line,
          column: 5,
        },
      ],
    },
  ],
};

describe('handle-cancel-first (untyped)', () => {
  ruleTester({ types: false }).run('handle-cancel-first', rule, testCases);
});

describe('handle-cancel-first (typed twin)', () => {
  ruleTester({ types: true }).run('handle-cancel-first', rule, testCases);
});

describe('handle-cancel-first direct valid fixtures', () => {
  const validFiles = corpusFiles('executor', 'valid').filter(
    (f) => !f.endsWith('11-executor-cancel-wiring-acknowledged-leak.ts'),
  );
  ruleTester({ types: false }).run('handle-cancel-first-valid-fixtures', rule, {
    valid: validFiles.map((f) => fs.readFileSync(f, 'utf8')),
    invalid: [],
  });
});
