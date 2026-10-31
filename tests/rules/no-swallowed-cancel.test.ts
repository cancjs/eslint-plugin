import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import type { MessageIds, RuleOptions as Options } from '../../src/rules/no-swallowed-cancel.js';
import rule from '../../src/rules/no-swallowed-cancel.js';
import { readMarkers } from '../helpers/corpus.js';
import { createTypedCorpusLinter } from '../helpers/typed-corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const familyDir = path.resolve(__dirname, '../fixtures/corpus/error-handling');

function corpus(file: string): string {
  return fs.readFileSync(path.join(familyDir, file), 'utf8');
}

const RULE_ID = 'no-swallowed-cancel';

const invalidFiles = fs
  .readdirSync(path.join(familyDir, 'invalid'))
  .filter((file) => readMarkers(path.join(familyDir, 'invalid', file)).some((m) => m.ruleId === RULE_ID))
  .map((file) => `invalid/${file}`);

const validFiles = fs.readdirSync(path.join(familyDir, 'valid')).map((file) => `valid/${file}`);

const invalid01 = corpus('invalid/01-no-swallowed-cancel-coroutine.ts');

// corpus files whose detection needs no type information
const corpusInvalid: InvalidTestCase<MessageIds, Options>[] = [
  {
    name: 'corpus: coroutine catch shows an error toast',
    code: invalid01,
    errors: [
      {
        messageId: 'swallowedCancel',
        line: 45,
        column: 5,
        suggestions: [
          {
            messageId: 'suggestRethrowCancel',
            output: invalid01.replace(
              '  showErrorToast(err); // lint',
              '  if (isCancelError(err)) throw err;\n  showErrorToast(err); // lint',
            ),
          },
        ],
      },
    ],
  },
  {
    name: 'corpus: guard that returns still swallows the cancel',
    code: corpus('invalid/07-no-swallowed-cancel-guard-return.ts'),
    errors: [{ messageId: 'swallowedCancel', line: 42, column: 5, suggestions: [] }],
  },
  {
    name: 'corpus: wrapped rethrow',
    code: corpus('invalid/09-no-swallowed-cancel-wrapped-rethrow.ts'),
    errors: [{ messageId: 'wrappedRethrow', line: 45, column: 5, suggestions: [] }],
  },
  {
    name: 'corpus: destructured catch parameter',
    code: corpus('invalid/10-no-swallowed-cancel-destructured-catch.ts'),
    errors: [{ messageId: 'destructuredCatch', line: 42, column: 12, suggestions: [] }],
  },
  {
    name: 'corpus: empty catch without a parameter',
    code: corpus('invalid/11-no-swallowed-cancel-empty-catch.ts'),
    errors: [{ messageId: 'swallowedCancel', line: 41, column: 5, suggestions: [] }],
  },
  {
    name: 'corpus: catch on a constructed cancelable promise',
    code: corpus('invalid/12-no-swallowed-cancel-promise-ctor-catch.ts'),
    errors: [{ messageId: 'swallowedCancel', line: 38, column: 10, suggestions: [] }],
  },
  {
    name: 'corpus: disjunction guard that returns swallows the cancel',
    code: corpus('invalid/17-no-swallowed-cancel-disjunction-guard-return.ts'),
    errors: [{ messageId: 'swallowedCancel', line: 35, column: 5, suggestions: [] }],
  },
];

// corpus files where the cancelable is a declared variable, visible only through types
const corpusTypeOnlyInvalid: InvalidTestCase<MessageIds, Options>[] = [
  {
    name: 'corpus: catch handler retries on cancel',
    code: corpus('invalid/02-no-swallowed-cancel-retry.ts'),
    errors: [{ messageId: 'swallowedCancel', line: 38, column: 34, suggestions: [] }],
  },
  {
    name: 'corpus: then rejection handler retries on cancel',
    code: corpus('invalid/08-no-swallowed-cancel-then-second-arg.ts'),
    errors: [{ messageId: 'swallowedCancel', line: 38, column: 28, suggestions: [] }],
  },
];

const HEAD = `import CancelablePromise, { isCancelError, catchCancel, suppressCancel, createIsError, suppressErrors, CancelError } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { TimeoutError } from '@cancjs/toolbox';
declare const job: CancelablePromise<number>;
declare function load(): CancelablePromise<number>;
declare function plain(): Promise<number>;
declare function toast(err: unknown): void;
declare const fallbackValue: number;
declare class WrapError extends Error {
  constructor(cause: unknown);
}`;

// expected suggestion output: the guard lands before the first statement, at its indent
function suggested(code: string, firstStatement: string) {
  const indent = /^ */.exec(firstStatement)?.[0] ?? '';
  const output = code.replace(
    firstStatement,
    `${indent}if (isCancelError(e)) throw e;
${firstStatement}`,
  );
  return [{ messageId: 'suggestRethrowCancel' as const, output }];
}

const inlineValid: ValidTestCase<Options>[] = [
  {
    name: 'specific error guard returns, then unconditional rethrow covers cancel',
    code: `${HEAD}
class HttpError extends Error {}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (e instanceof HttpError) {
      toast(e);
      return;
    }
    throw e;
  }
});`,
  },
  {
    name: 'boundary in both branches covers every exit',
    code: `${HEAD}
declare const a: boolean;
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (a) {
      suppressErrors(e, CancelError);
    } else {
      suppressErrors(e, CancelError);
    }
  }
});`,
  },
  {
    name: 'instanceof CancelError guard rethrows before other statements',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (e instanceof CancelError) throw e;
    toast(e);
  }
});`,
  },
  {
    name: 'await Promise.reject of the param on the cancel branch',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch(async (e) => {
  if (isCancelError(e)) return await Promise.reject(e);
  toast(e);
});`,
  },
  {
    name: 'conditional where both arms reject with the param',
    code: `${HEAD}
declare const x: boolean;
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  return x ? Promise.reject(e) : Promise.reject(e);
});`,
  },
  {
    name: 'globalThis.Promise.reject of the param on the cancel branch',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancelError(e)) return globalThis.Promise.reject(e);
  toast(e);
});`,
  },
  {
    name: 'Promise.reject with a cast param on the cancel branch',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancelError(e)) return Promise.reject(e as Error);
  toast(e);
});`,
  },
  {
    name: 'rejection callback returning Promise.reject of the param on the cancel branch',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancelError(e)) return Promise.reject(e);
  toast(e);
});`,
  },
  {
    name: 'rejection callback returning CancelablePromise.reject of the param on the cancel branch',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancelError(e)) return CancelablePromise.reject(e);
  toast(e);
});`,
  },
  {
    name: 'async catch clause returning Promise.reject of the param on the cancel branch',
    code: `${HEAD}
async function run() {
  try {
    await job;
  } catch (e) {
    if (isCancelError(e)) return Promise.reject(e);
    toast(e);
  }
}`,
  },
  {
    name: 'conditional arm rejecting with the param on the cancel branch',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => (isCancelError(e) ? Promise.reject(e) : 0));`,
  },
  {
    name: 'negated conditional rejecting with the param on the other arm',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => (!isCancelError(e) ? 0 : Promise.reject(e)));`,
  },
  {
    name: 'block callback returning a conditional that rejects with the param on the cancel arm',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  return isCancelError(e) ? Promise.reject(e) : 0;
});`,
  },
  {
    name: 'block callback returning a negated conditional that rejects with the param on the other arm',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  return !isCancelError(e) ? 0 : Promise.reject(e);
});`,
  },
  {
    name: 'async catch clause returning a conditional that rejects with the param on the cancel arm',
    code: `${HEAD}
async function run() {
  try {
    await job;
  } catch (e) {
    return isCancelError(e) ? Promise.reject(e) : 0;
  }
}`,
  },
  {
    name: 'sync catch clause returning Promise.reject of the param on the cancel branch',
    code: `${HEAD}
function run() {
  try {
    new CancelablePromise<number>((resolve) => resolve(1));
  } catch (e) {
    if (isCancelError(e)) return Promise.reject(e);
    toast(e);
  }
}`,
  },
  {
    name: 'guard that rethrows the cancel',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (isCancelError(e)) throw e;
    toast(e);
  }
});`,
  },
  {
    name: 'handler passed by reference is not visible',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch(toast);`,
  },
  {
    name: 'catch on a plain promise chain with types',
    code: `${HEAD}
plain().catch(() => fallbackValue);`,
  },
  {
    name: 'suppressErrors on the parameter is a boundary',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    suppressErrors(e, TimeoutError);
  }
});`,
  },
  {
    name: 'catchCancel on the parameter is a boundary',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => catchCancel(e));`,
  },
  {
    name: 'suppressCancel on the parameter is a boundary',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  suppressCancel(e);
});`,
  },
  {
    name: 'createIsError guard with else throw',
    code: `${HEAD}
const isRecoverable = createIsError(TimeoutError);
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (isRecoverable(e)) {
      toast(e);
    } else {
      throw e;
    }
  }
});`,
  },
  {
    name: 'configured boundary function',
    code: `${HEAD}
declare function myBoundary(e: unknown): void;
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    myBoundary(e);
  }
});`,
    settings: { canc: { boundaryFunctions: ['myBoundary'] } },
  },
  {
    name: 'try block holding no cancelable',
    code: `${HEAD}
async function run() {
  try {
    await plain();
  } catch (e) {
    toast(e);
  }
}`,
  },
  {
    name: 'nested try: the inner catch decides and rethrows',
    code: `${HEAD}
cancAsync(function* () {
  try {
    try {
      yield* cancAwait(load());
    } catch (e) {
      if (isCancelError(e)) throw e;
      toast(e);
    }
  } catch (outer) {
    toast(outer);
  }
});`,
  },
  {
    name: 'allowLogAndReturn accepts a log-only handler',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    console.error(e);
    return;
  }
});`,
    options: [{ allowLogAndReturn: true }],
  },
  {
    name: 'allowLogAndReturn accepts a guard that returns before log',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (isCancelError(e)) return 1;
    console.error(e);
  }
});`,
    options: [{ allowLogAndReturn: true }],
  },
  {
    name: 'allowLogAndReturn accepts a guard that logs and returns',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (isCancelError(e)) {
      console.log('canceled');
      return;
    }
    console.error(e);
  }
});`,
    options: [{ allowLogAndReturn: true }],
  },
  {
    name: 'allowEmptyCatch accepts an empty catch',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch {}
});`,
    options: [{ allowEmptyCatch: true }],
  },
  {
    name: 'rethrowing guard before the wrapper',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (isCancelError(e)) {
      throw e;
    }
    throw new WrapError(e);
  }
});`,
  },
  {
    name: 'renamed guard import is tracked',
    code: `import CancelablePromise, { isCancelError as isCancel } from '@cancjs/promise';
declare function toast(err: unknown): void;
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancel(e)) throw e;
  toast(e);
});`,
  },
  {
    name: 'rethrow through the coroutine throw helper',
    code: `${HEAD}
import { cancThrow } from '@cancjs/coroutine';
cancAsync(function* () {
  try {
    return yield* cancAwait(load());
  } catch (e) {
    toast(e);
    return yield* cancThrow(e);
  }
});`,
  },
];

const trackedRoot = `${HEAD}
CancelablePromise.resolve(1)
  .then((n) => n + 1)
  .then(undefined, (e) => {
    toast(e);
  });`;

const nestedInner = `${HEAD}
cancAsync(function* () {
  try {
    try {
      yield* cancAwait(load());
    } catch (e) {
      toast(e);
    }
  } catch (outer) {
    throw outer;
  }
});`;

const logOnly = `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    console.error(e);
    return;
  }
});`;

const boundaryOneBranch = `${HEAD}
declare const rare: boolean;
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (rare) {
      suppressErrors(e, CancelError);
    }
    toast(e);
    return 1;
  }
});`;

const inlineInvalid: InvalidTestCase<MessageIds, Options>[] = [
  {
    name: 'exit before guard leaves cancel swallowed',
    code: `${HEAD}
declare const x: boolean;
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (x) return 1;
    if (isCancelError(e)) throw e;
    toast(e);
  }
});`,
    errors: [{ messageId: 'swallowedCancel' }],
  },
  {
    name: 'boundary in only one branch leaves other branch unguarded',
    code: boundaryOneBranch,
    errors: [
      {
        messageId: 'swallowedCancel',
        suggestions: suggested(boundaryOneBranch, '    if (rare) {'),
      },
    ],
  },
  {
    name: 'Promise.reject of a new error on the cancel branch still swallows',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancelError(e)) return Promise.reject(new Error('failed'));
  toast(e);
});`,
    errors: [{ messageId: 'swallowedCancel', line: 12, column: 62 }],
  },
  {
    name: 'Promise.reject of the param on the non cancel branch only still swallows',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  if (!isCancelError(e)) return Promise.reject(e);
  toast(e);
});`,
    errors: [{ messageId: 'swallowedCancel', line: 12, column: 62 }],
  },
  {
    name: 'conditional rejecting on the non cancel arm only still swallows',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => (isCancelError(e) ? 0 : Promise.reject(e)));`,
    errors: [{ messageId: 'swallowedCancel', line: 12, column: 62 }],
  },
  {
    name: 'fallback value from a concise arrow handler',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch(() => fallbackValue);`,
    errors: [{ messageId: 'swallowedCancel', line: 12, column: 62, suggestions: [] }],
  },
  {
    name: 'guard that continues swallows the cancel',
    code: `${HEAD}
cancAsync(function* () {
  for (;;) {
    try {
      yield* cancAwait(load());
    } catch (e) {
      if (isCancelError(e)) continue;
      toast(e);
    }
  }
});`,
    errors: [{ messageId: 'swallowedCancel', line: 16, column: 7, suggestions: [] }],
  },
  {
    name: 'guard that breaks swallows the cancel',
    code: `${HEAD}
cancAsync(function* () {
  for (;;) {
    try {
      yield* cancAwait(load());
    } catch (e) {
      if (isCancelError(e)) break;
      toast(e);
    }
  }
});`,
    errors: [{ messageId: 'swallowedCancel', line: 16, column: 7, suggestions: [] }],
  },
  {
    name: 'guard that falls through swallows the cancel',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (isCancelError(e)) {
      toast('canceled');
    }
    toast(e);
  }
});`,
    errors: [{ messageId: 'swallowedCancel', line: 15, column: 5, suggestions: [] }],
  },
  {
    name: 'negated guard without a rethrow',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    if (!isCancelError(e)) toast(e);
  }
});`,
    errors: [{ messageId: 'swallowedCancel', line: 15, column: 5, suggestions: [] }],
  },
  {
    name: 'async rejection handler with a block body gets the suggestion',
    code: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch(async (e) => {
  toast(e);
});`,
    errors: [
      {
        messageId: 'swallowedCancel',
        line: 12,
        column: 62,
        suggestions: [
          {
            messageId: 'suggestRethrowCancel',
            output: `${HEAD}
new CancelablePromise<number>((resolve) => resolve(1)).catch(async (e) => {
  if (isCancelError(e)) throw e;
  toast(e);
});`,
          },
        ],
      },
    ],
  },
  {
    name: 'empty catch with a parameter gets the suggestion inside the braces',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {}
});`,
    errors: [
      {
        messageId: 'swallowedCancel',
        line: 15,
        column: 5,
        suggestions: [
          {
            messageId: 'suggestRethrowCancel',
            output: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) { if (isCancelError(e)) throw e; }
});`,
          },
        ],
      },
    ],
  },
  {
    name: 'tracked root chain reports without types',
    code: trackedRoot,
    errors: [
      { messageId: 'swallowedCancel', line: 14, column: 20, suggestions: suggested(trackedRoot, '    toast(e);') },
    ],
  },
  {
    name: 'nested try: the inner catch swallows',
    code: nestedInner,
    errors: [
      { messageId: 'swallowedCancel', line: 16, column: 7, suggestions: suggested(nestedInner, '      toast(e);') },
    ],
  },
  {
    name: 'allowLogAndReturn off reports a log-only handler',
    code: logOnly,
    options: [{ allowLogAndReturn: false }],
    errors: [
      { messageId: 'swallowedCancel', line: 15, column: 5, suggestions: suggested(logOnly, '    console.error(e);') },
    ],
  },
  {
    name: 'allowEmptyCatch off reports an empty catch',
    code: `${HEAD}
cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch {}
});`,
    options: [{ allowEmptyCatch: false }],
    errors: [{ messageId: 'swallowedCancel', line: 15, column: 5, suggestions: [] }],
  },
  {
    name: 'wrapper call carrying the parameter',
    code: `${HEAD}
declare function wrap(cause: unknown): Error;
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  throw wrap(e);
});`,
    errors: [{ messageId: 'wrappedRethrow', line: 14, column: 3 }],
  },
  {
    name: 'renamed constructor import is tracked',
    code: `import { CancelablePromise as Job, isCancelError as isCancel } from '@cancjs/promise';
declare function toast(err: unknown): void;
new Job<number>((resolve) => resolve(1)).catch((e) => {
  toast(e);
});`,
    errors: [
      {
        messageId: 'swallowedCancel',
        line: 3,
        column: 48,
        suggestions: [
          {
            messageId: 'suggestRethrowCancel',
            output: `import { CancelablePromise as Job, isCancelError as isCancel } from '@cancjs/promise';
declare function toast(err: unknown): void;
new Job<number>((resolve) => resolve(1)).catch((e) => {
  if (isCancel(e)) throw e;
  toast(e);
});`,
          },
        ],
      },
    ],
  },
  {
    name: 'no suggestion when isCancelError is not imported',
    code: `import CancelablePromise from '@cancjs/promise';
declare function toast(err: unknown): void;
new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
  toast(e);
});`,
    errors: [{ messageId: 'swallowedCancel', line: 3, column: 62, suggestions: [] }],
  },
  {
    name: 'no suggestion when a local binding shadows the guard',
    code: `${HEAD}
function scope(isCancelError: (e: unknown) => boolean) {
  return new CancelablePromise<number>((resolve) => resolve(1)).catch((e) => {
    toast(e);
    return isCancelError;
  });
}`,
    errors: [{ messageId: 'swallowedCancel', line: 13, column: 71, suggestions: [] }],
  },
];

const awaitInTry = `${HEAD}
async function run() {
  try {
    await load();
  } catch (e) {
    toast(e);
  }
}`;

const typeOnlyInvalid: InvalidTestCase<MessageIds, Options>[] = [
  {
    name: 'variable-held cancelable chain',
    code: `${HEAD}
job.catch(() => fallbackValue);`,
    errors: [{ messageId: 'swallowedCancel', line: 12, column: 11, suggestions: [] }],
  },
  {
    name: 'await of a cancelable call in a try block',
    code: awaitInTry,
    errors: [
      { messageId: 'swallowedCancel', line: 15, column: 5, suggestions: suggested(awaitInTry, '    toast(e);') },
    ],
  },
];

const corpusValid: ValidTestCase<Options>[] = validFiles.map((file) => ({
  name: `corpus: ${file}`,
  code: corpus(file),
}));

const typedInvalid = [...corpusInvalid, ...corpusTypeOnlyInvalid, ...inlineInvalid, ...typeOnlyInvalid];
const untypedSilent = [...corpusTypeOnlyInvalid, ...typeOnlyInvalid];

describe('canc/no-swallowed-cancel', () => {
  it('covers every corpus file and at least 20 cases', () => {
    const covered = [...corpusInvalid, ...corpusTypeOnlyInvalid].length;
    expect(covered).toBe(invalidFiles.length);
    const total = typedInvalid.length + corpusValid.length + inlineValid.length;
    console.log(`no-swallowed-cancel typed cases: ${total} (${typedInvalid.length} invalid)`);
    expect(total).toBeGreaterThanOrEqual(20);
  });

  ruleTester({ types: true }).run(RULE_ID, rule, {
    valid: [...corpusValid, ...inlineValid],
    invalid: typedInvalid,
  });

  ruleTester({ types: false }).run(`${RULE_ID} without type information`, rule, {
    valid: [
      ...corpusValid,
      ...inlineValid,
      ...untypedSilent.map(({ name, code, options }) => ({
        name: `untyped: ${name}`,
        code,
        ...(options && { options }),
      })),
    ],
    invalid: [...corpusInvalid, ...inlineInvalid],
  });
});

// legacy markers sit on the consequence line, the rule reports at the catch that owns it
function expectedLine(file: string, markerLine: number): number {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let line = markerLine; line > 0; line--) {
    if (/\bcatch\b/.test(lines[line - 1])) {
      return line;
    }
  }
  return markerLine;
}

describe('no-swallowed-cancel typed corpus lane', () => {
  it('matches the markers of every error-handling file', async () => {
    (plugin.rules as Record<string, unknown>)[RULE_ID] = rule;
    const linter = createTypedCorpusLinter([{ rules: { [`canc/${RULE_ID}`]: 'error' } }]);
    const files = [...invalidFiles, ...validFiles].map((file) => path.join(familyDir, file));

    const results = await linter.lintFiles(files);
    expect(results).toHaveLength(files.length);

    for (const result of results) {
      const name = path.relative(familyDir, result.filePath).replaceAll('\\', '/');
      const markers = readMarkers(result.filePath).filter((m) => m.ruleId === RULE_ID);
      if (name.startsWith('invalid/')) {
        expect(markers.length, name).toBeGreaterThan(0);
      }
      const own = result.messages.filter((m) => m.ruleId === `canc/${RULE_ID}`);
      expect(
        result.messages.filter((m) => m.fatal),
        name,
      ).toEqual([]);
      expect(
        own.map((m) => `${name}:${m.line}`),
        name,
      ).toEqual(markers.map((m) => `${name}:${m.messageId ? m.line : expectedLine(result.filePath, m.line)}`));
      for (const [i, marker] of markers.entries()) {
        expect(own[i]?.messageId, name).toBe(marker.messageId ?? 'swallowedCancel');
      }
    }
  });
});
