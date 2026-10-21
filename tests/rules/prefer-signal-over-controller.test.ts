import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import type { MessageIds, RuleOptions } from '../../src/rules/prefer-signal-over-controller.js';
import rule from '../../src/rules/prefer-signal-over-controller.js';
import { readMarkers } from '../helpers/corpus.js';
import { createTypedCorpusLinter } from '../helpers/typed-corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid03Path = path.resolve(
  __dirname,
  '../fixtures/corpus/hygiene/invalid/03-prefer-signal-over-controller-param.ts',
);
const invalid04Path = path.resolve(
  __dirname,
  '../fixtures/corpus/hygiene/invalid/04-prefer-signal-over-controller-forwarded.ts',
);

const valid03Path = path.resolve(
  __dirname,
  '../fixtures/corpus/hygiene/valid/03-prefer-signal-over-controller-signal-param.ts',
);
const valid04Path = path.resolve(
  __dirname,
  '../fixtures/corpus/hygiene/valid/04-prefer-signal-over-controller-signal-forwarded.ts',
);

const codeInvalid03 = fs.readFileSync(invalid03Path, 'utf8');
const codeInvalid04 = fs.readFileSync(invalid04Path, 'utf8');

const codeValid03 = fs.readFileSync(valid03Path, 'utf8');
const codeValid04 = fs.readFileSync(valid04Path, 'utf8');

const markers03 = readMarkers(invalid03Path);
const markers04 = readMarkers(invalid04Path);

const testCases: {
  valid: (ValidTestCase<RuleOptions> | string)[];
  invalid: InvalidTestCase<MessageIds, RuleOptions>[];
} = {
  valid: [
    `const controller = new AbortController();
handleCancel(() => controller.abort());`,
    `function createController() {
  const controller = new AbortController();
  return controller;
}`,
    `declare function fn(s: AbortSignal): void;
const controller = new AbortController();
fn(controller.signal);`,
    `declare function fn(s: unknown): void;
const controller = new AbortController();
fn({ signal: controller.signal });`,
    {
      code: `declare function allowedFn(c: AbortController): void;
const controller = new AbortController();
allowedFn(controller);`,
      options: [{ allowedCallees: ['allowedFn'] }],
    },
    `class AbortController {}
function handle(c: AbortController) {
  fn(c);
}`,
    `class AbortController {}
const c = new AbortController();
fn(c);`,
    `function handle(c: any) {
  fn(c);
}`,
    `function handle(...controllers: AbortController[]) {}`,
    `declare function fn(s: AbortSignal): void;
function handle(signal: AbortSignal) {
  fn(signal);
}`,
    `declare function fn(s: AbortSignal): void;
fn(AbortSignal.any([]));`,
    codeValid03,
    codeValid04,
  ],
  invalid: [
    {
      code: 'function handle(controller: AbortController) {}',
      errors: [
        {
          messageId: 'preferSignal',
          line: 1,
          column: 17,
          suggestions: null,
        },
      ],
    },
    {
      code: `function handle(controller: AbortController) {\n  return controller.signal;\n}`,
      errors: [
        {
          messageId: 'preferSignal',
          line: 1,
          column: 17,
          suggestions: [
            {
              messageId: 'suggestAnnotateSignal',
              output: `function handle(controller: AbortSignal) {\n  return controller;\n}`,
            },
          ],
        },
      ],
    },
    {
      code: `function handle(controller: AbortController) {\n  controller.abort();\n}`,
      errors: [
        {
          messageId: 'preferSignal',
          line: 1,
          column: 17,
          suggestions: null,
        },
      ],
    },
    {
      code: `declare function fn(c: unknown): void;\nconst controller = new AbortController();\nfn(controller);`,
      errors: [
        {
          messageId: 'preferSignal',
          line: 3,
          column: 4,
          suggestions: [
            {
              messageId: 'suggestPassSignal',
              data: { name: 'controller' },
              output: `declare function fn(c: unknown): void;\nconst controller = new AbortController();\nfn(controller.signal);`,
            },
          ],
        },
      ],
    },
    {
      code: `class Service {\n  run(controller: AbortController) {}\n}`,
      errors: [
        {
          messageId: 'preferSignal',
          line: 2,
          column: 7,
          suggestions: null,
        },
      ],
    },
    {
      code: 'function handle(controller: AbortController = new AbortController()) {}',
      errors: [
        {
          messageId: 'preferSignal',
          line: 1,
          column: 17,
          suggestions: null,
        },
      ],
    },
    {
      code: codeInvalid03,
      errors: [
        {
          messageId: 'preferSignal',
          line: markers03[0].line,
          column: 29,
          suggestions: null,
        },
      ],
    },
    {
      code: codeInvalid04,
      errors: [
        {
          messageId: 'preferSignal',
          line: markers04[0].line,
          column: 21,
          suggestions: [
            {
              messageId: 'suggestPassSignal',
              data: { name: 'controller' },
              output: codeInvalid04.replace('return fetchStage(controller);', 'return fetchStage(controller.signal);'),
            },
          ],
        },
      ],
    },
  ],
};

describe('prefer-signal-over-controller (untyped)', () => {
  ruleTester({ types: false }).run('prefer-signal-over-controller', rule, testCases);
});

describe('prefer-signal-over-controller (typed twin)', () => {
  ruleTester({ types: true }).run('prefer-signal-over-controller', rule, testCases);
});

describe('prefer-signal-over-controller (inferred parameter in typed lane)', () => {
  ruleTester({ types: true }).run('prefer-signal-over-controller-inferred', rule, {
    valid: [],
    invalid: [
      {
        code: `function handle(controller = new AbortController()) {\n  return controller.signal;\n}`,
        errors: [
          {
            messageId: 'preferSignal',
            line: 1,
            column: 17,
            suggestions: [
              {
                messageId: 'suggestAnnotateSignal',
                output: `function handle(controller: AbortSignal = new AbortController()) {\n  return controller;\n}`,
              },
            ],
          },
        ],
      },
    ],
  });

  ruleTester({ types: false }).run('prefer-signal-over-controller-inferred-silent-untyped', rule, {
    valid: [
      `function handle(controller = new AbortController()) {
  return controller.signal;
}`,
    ],
    invalid: [],
  });
});

describe('prefer-signal-over-controller typed corpus lane', () => {
  it('passes corpus hygiene twins via createTypedCorpusLinter', async () => {
    (plugin.rules as Record<string, unknown>)['prefer-signal-over-controller'] = rule;

    const linter = createTypedCorpusLinter([
      {
        rules: {
          'canc/prefer-signal-over-controller': 'error',
        },
      },
    ]);

    const results = await linter.lintFiles([invalid03Path, invalid04Path, valid03Path, valid04Path]);

    for (const r of results) {
      const relPath = path.basename(r.filePath);
      if (relPath.includes('valid')) {
        expect(r.messages).toEqual([]);
      } else {
        const markers = readMarkers(r.filePath);
        expect(r.messages).toHaveLength(markers.length);
        for (let i = 0; i < markers.length; i++) {
          expect(r.messages[i]?.line).toBe(markers[i]?.line);
          expect(r.messages[i]?.ruleId).toBe('canc/prefer-signal-over-controller');
        }
      }
    }
  });
});
