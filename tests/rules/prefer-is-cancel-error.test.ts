import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import type { MessageIds } from '../../src/rules/prefer-is-cancel-error.js';
import rule from '../../src/rules/prefer-is-cancel-error.js';
import { readMarkers } from '../helpers/corpus.js';
import { createTypedCorpusLinter } from '../helpers/typed-corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const invalid03Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/03-prefer-is-cancel-error-instanceof.ts',
);
const invalid04Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/04-prefer-is-cancel-error-name-string.ts',
);
const invalid05Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/05-prefer-is-cancel-error-abort-error-wrong-layer.ts',
);
const invalid06Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/06-prefer-is-cancel-error-instance-check.ts',
);
const invalid13Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/13-prefer-is-cancel-error-renamed-import.ts',
);
const invalid14Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/14-prefer-is-cancel-error-switch-name.ts',
);
const invalid15Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/15-prefer-is-cancel-error-negated-instanceof.ts',
);
const invalid16Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/16-prefer-is-cancel-error-name-aborterror.ts',
);
const invalid18Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/invalid/18-prefer-is-cancel-error-branded-instanceof.ts',
);

const valid04Path = path.resolve(__dirname, '../fixtures/corpus/error-handling/valid/04-prefer-is-cancel-error.ts');
const valid05Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/valid/05-prefer-is-cancel-error-iscancpromise.ts',
);
const valid06Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/valid/06-prefer-is-cancel-error-isaborterror.ts',
);
const valid12Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/valid/12-prefer-is-cancel-error-istimeouterror-fallback.ts',
);
const valid13Path = path.resolve(
  __dirname,
  '../fixtures/corpus/error-handling/valid/13-prefer-is-cancel-error-branded-guards.ts',
);

const PREAMBLE = `import { CancelError, CancelablePromise, isCancelError, isCancPromise } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare const catalogSearch: CancelablePromise<number>;
declare const x: unknown;
declare const err: unknown;
declare function showToast(e: unknown): void;
declare function fetchPlain(): Promise<void>;`;

const typedCases: {
  valid: (ValidTestCase<[]> | string)[];
  invalid: InvalidTestCase<MessageIds, []>[];
} = {
  valid: [
    // Untracked class named CancelError
    `class CancelError {}
declare const x: unknown;
if (x instanceof CancelError) {}`,

    // Untracked class named CancelablePromise
    `class CancelablePromise {}
declare const x: unknown;
if (x instanceof CancelablePromise) {}`,

    // Standard Error check
    `declare const x: unknown;
if (x instanceof Error) {}`,

    // Lexical shadowing: parameter shadows CancelError
    `${PREAMBLE}
function handle(CancelError: unknown) {
  if (x instanceof (CancelError as any)) {}
}`,

    // Lexical shadowing: local const shadows CancelError
    `${PREAMBLE}
function handle() {
  const CancelError = class {};
  if (x instanceof CancelError) {}
}`,

    // Brand checks already in use
    `${PREAMBLE}
if (isCancelError(x)) {}
if (isCancPromise(x)) {}`,

    // Fallback helper definitions
    `function isTimeoutError(err: any): boolean {
  return err.name === 'CancelError';
}`,
    `function isAbortError(err: any): boolean {
  return err.name === 'AbortError';
}`,
    `function isSupersededError(err: any): boolean {
  return err.name === 'SupersededError';
}`,

    // Untracked class named TimeoutError
    `class TimeoutError {}
declare const x: unknown;
if (x instanceof TimeoutError) {}`,

    // Import from @cancjs/toolbox without TimeoutError
    `import { debounce } from '@cancjs/toolbox';
class TimeoutError {}
declare const x: unknown;
if (x instanceof TimeoutError) {}`,

    // SupersededError name check without importing SupersededError (silent)
    `import { debounce } from '@cancjs/toolbox';
declare const err: { name: string };
if (err.name === 'SupersededError') {}`,

    // Silent twin: Pattern 4 in a try block without any cancelable
    `declare function run(): void;
try {
  run();
} catch (err) {
  if (err instanceof DOMException && (err as any).name === 'AbortError') {
    showToast(err);
  }
}`,
  ],
  invalid: [
    // Compound check where error targets do not match
    // (no abortErrorWrongLayer, reports preferIsAbortError)
    {
      code: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (err) {
    declare const other: any;
    if (err instanceof DOMException && other.name === 'AbortError') {}
  }
});`,
      output: null,
      errors: [
        {
          messageId: 'preferIsAbortError',
          data: { value: 'other' },
          line: 13,
          column: 40,
          suggestions: [
            {
              messageId: 'suggestUseIsAbortError',
              data: { value: 'other' },
              output: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (err) {
    declare const other: any;
    if (err instanceof DOMException && isAbortError(other)) {}
  }
});`,
            },
          ],
        },
      ],
    },
    // Pattern 1: x instanceof CancelError with tracked import in scope (autofix)
    {
      code: `${PREAMBLE}
if (x instanceof CancelError) {}`,
      output: `${PREAMBLE}
if (isCancelError(x)) {}`,
      errors: [
        {
          messageId: 'instanceofCancelError',
          data: { value: 'x' },
          line: 8,
          column: 5,
        },
      ],
    },

    // Pattern 1: Negated form !(x instanceof CancelError)
    {
      code: `${PREAMBLE}
if (!(x instanceof CancelError)) {
  showToast(x);
}`,
      output: `${PREAMBLE}
if (!isCancelError(x)) {
  showToast(x);
}`,
      errors: [
        {
          messageId: 'instanceofCancelError',
          data: { value: 'x' },
          line: 8,
          column: 7,
        },
      ],
    },

    // Pattern 1: Renamed import
    {
      code: `import { CancelError as CE, isCancelError as isCE } from '@cancjs/promise';
declare const x: unknown;
if (x instanceof CE) {}`,
      output: `import { CancelError as CE, isCancelError as isCE } from '@cancjs/promise';
declare const x: unknown;
if (isCE(x)) {}`,
      errors: [
        {
          messageId: 'instanceofCancelError',
          data: { value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },

    // Pattern 1: Compound binary expression a && x instanceof CancelError
    {
      code: `${PREAMBLE}
declare const a: boolean;
if (a && x instanceof CancelError) {}`,
      output: `${PREAMBLE}
declare const a: boolean;
if (a && isCancelError(x)) {}`,
      errors: [
        {
          messageId: 'instanceofCancelError',
          data: { value: 'x' },
          line: 9,
          column: 10,
        },
      ],
    },

    // Pattern 1: Tracked import absent -> report only, no fix
    {
      code: `import { CancelError } from '@cancjs/promise';
declare const x: unknown;
if (x instanceof CancelError) {}`,
      output: null,
      errors: [
        {
          messageId: 'instanceofCancelError',
          data: { value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },

    // Pattern 2: x.name === 'CancelError' with suggestion
    {
      code: `${PREAMBLE}
declare const errObj: { name: string };
if (errObj.name === 'CancelError') {}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckCancelError',
          data: { value: 'errObj' },
          line: 9,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseIsCancelError',
              data: { value: 'errObj' },
              output: `${PREAMBLE}
declare const errObj: { name: string };
if (isCancelError(errObj)) {}`,
            },
          ],
        },
      ],
    },

    // Pattern 2: Optional chaining x?.name === 'CancelError'
    {
      code: `${PREAMBLE}
declare const errObj: { name: string } | null;
if (errObj?.name === 'CancelError') {}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckCancelError',
          data: { value: 'errObj' },
          line: 9,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseIsCancelError',
              data: { value: 'errObj' },
              output: `${PREAMBLE}
declare const errObj: { name: string } | null;
if (isCancelError(errObj)) {}`,
            },
          ],
        },
      ],
    },

    // Pattern 2: Negated check x.name !== 'CancelError'
    {
      code: `${PREAMBLE}
declare const errObj: { name: string };
if (errObj.name !== 'CancelError') {}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckCancelError',
          data: { value: 'errObj' },
          line: 9,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseIsCancelError',
              data: { value: 'errObj' },
              output: `${PREAMBLE}
declare const errObj: { name: string };
if (!isCancelError(errObj)) {}`,
            },
          ],
        },
      ],
    },

    // Pattern 2: Switch statement switch (x.name) { case 'CancelError': }
    {
      code: `${PREAMBLE}
declare const errObj: { name: string };
switch (errObj.name) {
  case 'CancelError':
    break;
}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckCancelError',
          data: { value: 'errObj' },
          line: 10,
          column: 3,
        },
      ],
    },

    // Pattern 3: x instanceof CancelablePromise with autofix
    {
      code: `${PREAMBLE}
if (x instanceof CancelablePromise) {}`,
      output: `${PREAMBLE}
if (isCancPromise(x)) {}`,
      errors: [
        {
          messageId: 'instanceofCancPromise',
          data: { value: 'x' },
          line: 8,
          column: 5,
        },
      ],
    },

    // Pattern 3: Negated form !(x instanceof CancelablePromise)
    {
      code: `${PREAMBLE}
if (!(x instanceof CancelablePromise)) {}`,
      output: `${PREAMBLE}
if (!isCancPromise(x)) {}`,
      errors: [
        {
          messageId: 'instanceofCancPromise',
          data: { value: 'x' },
          line: 8,
          column: 7,
        },
      ],
    },

    // Pattern 3: Tracked import absent -> report only, no fix
    {
      code: `import { CancelablePromise } from '@cancjs/promise';
declare const x: unknown;
if (x instanceof CancelablePromise) {}`,
      output: null,
      errors: [
        {
          messageId: 'instanceofCancPromise',
          data: { value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },

    // Pattern 4: Compound check in cancelable flow catch (DOMException && AbortError)
    {
      code: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if (e instanceof DOMException && (e as any).name === 'AbortError') {}
  }
});`,
      output: null,
      errors: [
        {
          messageId: 'abortErrorWrongLayer',
          data: { value: 'e as any' },
          line: 12,
          column: 9,
          suggestions: [
            {
              messageId: 'suggestUseIsCancelError',
              data: { value: 'e as any' },
              output: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if (isCancelError(e as any)) {}
  }
});`,
            },
          ],
        },
      ],
    },

    // Pattern 4: Compound check in reverse order (AbortError && DOMException)
    {
      code: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if ((e as any).name === 'AbortError' && e instanceof DOMException) {}
  }
});`,
      output: null,
      errors: [
        {
          messageId: 'abortErrorWrongLayer',
          data: { value: 'e as any' },
          line: 12,
          column: 9,
          suggestions: [
            {
              messageId: 'suggestUseIsCancelError',
              data: { value: 'e as any' },
              output: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if (isCancelError(e as any)) {}
  }
});`,
            },
          ],
        },
      ],
    },

    // Pattern 4: Nested if form
    {
      code: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if (e instanceof DOMException) {
      if ((e as any).name === 'AbortError') {}
    }
  }
});`,
      output: null,
      errors: [
        {
          messageId: 'abortErrorWrongLayer',
          data: { value: 'e as any' },
          line: 13,
          column: 11,
          suggestions: [],
        },
      ],
    },

    // Pattern 4: Chained && check with extra condition
    {
      code: `${PREAMBLE}
declare const extraCondition: boolean;
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if (extraCondition && e instanceof DOMException && (e as any).name === 'AbortError') {}
  }
});`,
      output: null,
      errors: [
        {
          messageId: 'abortErrorWrongLayer',
          data: { value: 'e as any' },
          line: 13,
          column: 56,
          suggestions: [],
        },
      ],
    },

    // Pattern 5: Standalone AbortError inside cancelable catch when not compound
    {
      code: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if ((e as any).name === 'AbortError') {}
  }
});`,
      output: null,
      errors: [
        {
          messageId: 'preferIsAbortError',
          data: { value: 'e as any' },
          line: 12,
          column: 9,
          suggestions: [
            {
              messageId: 'suggestUseIsAbortError',
              data: { value: 'e as any' },
              output: `${PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (e) {
    if (isAbortError(e as any)) {}
  }
});`,
            },
          ],
        },
      ],
    },

    // Pattern 2: Inside a regular error handler (not isTimeoutError/isAbortError helper) reports
    {
      code: `function handleError(err: any) {
  if (err.name === 'CancelError') {}
}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckCancelError',
          data: { value: 'err' },
          line: 2,
          column: 7,
          suggestions: [
            {
              messageId: 'suggestUseIsCancelError',
              data: { value: 'err' },
              output: `function handleError(err: any) {
  if (isCancelError(err)) {}
}`,
            },
          ],
        },
      ],
    },

    // Pattern 5: x.name === 'AbortError' standing alone
    {
      code: `declare const err: { name: string };
if (err.name === 'AbortError') {}`,
      output: null,
      errors: [
        {
          messageId: 'preferIsAbortError',
          data: { value: 'err' },
          line: 2,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseIsAbortError',
              data: { value: 'err' },
              output: `declare const err: { name: string };
if (isAbortError(err)) {}`,
            },
          ],
        },
      ],
    },

    // Pattern 5: x?.name === 'AbortError' standing alone
    {
      code: `declare const err: { name: string } | null;
if (err?.name === 'AbortError') {}`,
      output: null,
      errors: [
        {
          messageId: 'preferIsAbortError',
          data: { value: 'err' },
          line: 2,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseIsAbortError',
              data: { value: 'err' },
              output: `declare const err: { name: string } | null;
if (isAbortError(err)) {}`,
            },
          ],
        },
      ],
    },

    // Pattern 5: Negated check x.name !== 'AbortError'
    {
      code: `declare const err: { name: string };
if (err.name !== 'AbortError') {}`,
      output: null,
      errors: [
        {
          messageId: 'preferIsAbortError',
          data: { value: 'err' },
          line: 2,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseIsAbortError',
              data: { value: 'err' },
              output: `declare const err: { name: string };
if (!isAbortError(err)) {}`,
            },
          ],
        },
      ],
    },

    // Branded errors: TimeoutError instanceof with guard imported
    {
      code: `import { TimeoutError, isTimeoutError } from '@cancjs/toolbox';
declare const x: unknown;
if (x instanceof TimeoutError) {}`,
      output: `import { TimeoutError, isTimeoutError } from '@cancjs/toolbox';
declare const x: unknown;
if (isTimeoutError(x)) {}`,
      errors: [
        {
          messageId: 'instanceofBrandedError',
          data: { className: 'TimeoutError', guard: 'isTimeoutError', value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },

    // Branded errors: TimeoutError instanceof without guard imported
    {
      code: `import { TimeoutError } from '@cancjs/toolbox';
declare const x: unknown;
if (x instanceof TimeoutError) {}`,
      output: null,
      errors: [
        {
          messageId: 'instanceofBrandedError',
          data: { className: 'TimeoutError', guard: 'isTimeoutError', value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },

    // Branded errors: Name check for TimeoutError
    {
      code: `declare const errObj: { name: string };
if (errObj.name === 'TimeoutError') {}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckBrandedError',
          data: { className: 'TimeoutError', guard: 'isTimeoutError', value: 'errObj' },
          line: 2,
          column: 5,
          suggestions: [
            {
              messageId: 'suggestUseGuard',
              data: { guard: 'isTimeoutError', value: 'errObj' },
              output: `declare const errObj: { name: string };
if (isTimeoutError(errObj)) {}`,
            },
          ],
        },
      ],
    },

    // Branded errors: Switch statement on SupersededError with import
    {
      code: `import { SupersededError } from '@cancjs/toolbox';
declare const errObj: { name: string };
switch (errObj.name) {
  case 'SupersededError':
    break;
}`,
      output: null,
      errors: [
        {
          messageId: 'nameCheckBrandedError',
          data: { className: 'SupersededError', guard: 'isSupersededError', value: 'errObj' },
          line: 4,
          column: 3,
        },
      ],
    },

    // Branded errors: BreakError instanceof with guard imported
    {
      code: `import { BreakError, isBreakError } from '@cancjs/coroutine';
declare const x: unknown;
if (x instanceof BreakError) {}`,
      output: `import { BreakError, isBreakError } from '@cancjs/coroutine';
declare const x: unknown;
if (isBreakError(x)) {}`,
      errors: [
        {
          messageId: 'instanceofBrandedError',
          data: { className: 'BreakError', guard: 'isBreakError', value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },

    // Branded errors: AbortError instanceof with guard imported
    {
      code: `import { AbortError, isAbortError } from '@cancjs/toolbox';
declare const x: unknown;
if (x instanceof AbortError) {}`,
      output: `import { AbortError, isAbortError } from '@cancjs/toolbox';
declare const x: unknown;
if (isAbortError(x)) {}`,
      errors: [
        {
          messageId: 'instanceofBrandedError',
          data: { className: 'AbortError', guard: 'isAbortError', value: 'x' },
          line: 3,
          column: 5,
        },
      ],
    },
  ],
};

describe('canc/prefer-is-cancel-error typed lane', () => {
  ruleTester({ types: true }).run('prefer-is-cancel-error-typed', rule, typedCases);
});

describe('canc/prefer-is-cancel-error untyped degrade lane', () => {
  ruleTester({ types: false }).run('prefer-is-cancel-error-untyped', rule, {
    valid: [
      // Pattern 4 is silent when parser services are absent
      `${PREAMBLE}
try {
  fetchPlain();
} catch (e) {
  if (e instanceof DOMException && (e as any).name === 'AbortError') {}
}`,
    ],
    invalid: [
      // Pattern 1 still works in untyped lane
      {
        code: `${PREAMBLE}
if (x instanceof CancelError) {}`,
        output: `${PREAMBLE}
if (isCancelError(x)) {}`,
        errors: [{ messageId: 'instanceofCancelError' }],
      },
      // Pattern 2 still works in untyped lane
      {
        code: `${PREAMBLE}
declare const errObj: { name: string };
if (errObj.name === 'CancelError') {}`,
        output: null,
        errors: [
          {
            messageId: 'nameCheckCancelError',
            suggestions: [
              {
                messageId: 'suggestUseIsCancelError',
                output: `${PREAMBLE}
declare const errObj: { name: string };
if (isCancelError(errObj)) {}`,
              },
            ],
          },
        ],
      },
      // Pattern 3 still works in untyped lane
      {
        code: `${PREAMBLE}
if (x instanceof CancelablePromise) {}`,
        output: `${PREAMBLE}
if (isCancPromise(x)) {}`,
        errors: [{ messageId: 'instanceofCancPromise' }],
      },
      // Pattern 5 still works in untyped lane
      {
        code: `declare const err: any;
if (err.name === 'AbortError') {}`,
        output: null,
        errors: [
          {
            messageId: 'preferIsAbortError',
            suggestions: [
              {
                messageId: 'suggestUseIsAbortError',
                output: `declare const err: any;
if (isAbortError(err)) {}`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('prefer-is-cancel-error typed corpus lane', () => {
  it('passes all blessed error-handling corpus twins', async () => {
    (plugin.rules as Record<string, unknown>)['prefer-is-cancel-error'] = rule;

    const linter = createTypedCorpusLinter([
      {
        rules: {
          'canc/prefer-is-cancel-error': 'error',
        },
      },
    ]);

    const targets = [
      invalid03Path,
      invalid04Path,
      invalid05Path,
      invalid06Path,
      invalid13Path,
      invalid14Path,
      invalid15Path,
      invalid16Path,
      invalid18Path,
      valid04Path,
      valid05Path,
      valid06Path,
      valid12Path,
      valid13Path,
    ];

    const results = await linter.lintFiles(targets);

    for (const r of results) {
      const relPath = path.basename(r.filePath);
      if (relPath.includes('valid')) {
        expect(r.messages).toEqual([]);
      } else {
        const markers = readMarkers(r.filePath);
        expect(r.messages).toHaveLength(markers.length);
        for (let i = 0; i < markers.length; i++) {
          expect(r.messages[i]?.line).toBe(markers[i]?.line);
          expect(r.messages[i]?.ruleId).toBe('canc/prefer-is-cancel-error');
        }
      }
    }
  });
});
