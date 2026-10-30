import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import type { MessageIds, RuleOptions as Options } from '../../src/rules/no-cancelability-erasure.js';
import rule from '../../src/rules/no-cancelability-erasure.js';
import { readMarkers } from '../helpers/corpus.js';
import { createTypedCorpusLinter } from '../helpers/typed-corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const flowDir = path.resolve(__dirname, '../fixtures/corpus/flow');

const invalidTwins = [
  'invalid/01-no-cancelability-erasure-arg.ts',
  'invalid/02-no-cancelability-erasure-return.ts',
  'invalid/03-no-cancelability-erasure-annotation-widening.ts',
  'invalid/04-no-cancelability-erasure-promiselike.ts',
  'invalid/08-no-cancelability-erasure-failure-declared-erased.ts',
].map((file) => path.join(flowDir, file));

const validTwins = [
  'valid/01-no-cancelability-erasure-cancel-handle-retained.ts',
  'valid/02-no-cancelability-erasure-signature-preserved.ts',
  'valid/03-no-cancelability-erasure-satisfies.ts',
  'valid/04-no-cancelability-erasure-explicit-adoption.ts',
  'valid/05-no-cancelability-erasure-jsdoc-cast.ts',
  'valid/06-no-cancelability-erasure-boundary-form.ts',
  'valid/07-no-cancelability-erasure-union-sink.ts',
  'valid/15-no-cancelability-erasure-with-failure.ts',
  'valid/16-no-cancelability-erasure-adopted-into-cancelable.ts',
  'valid/17-no-cancelability-erasure-satisfies-two-param.ts',
].map((file) => path.join(flowDir, file));

const HEAD = `import CancelablePromise from '@cancjs/promise';
declare function load(): CancelablePromise<number>;
declare function track(p: Promise<number>): void;`;

const valid: ValidTestCase<Options>[] = [
  {
    name: 'local handle with a visible cancel stays silent',
    code: `${HEAD}
const job = load();
track(job);
setTimeout(() => job.cancel(), 10);`,
  },
  {
    name: 'cancelable return type keeps the capability',
    code: `${HEAD}
function run(): CancelablePromise<number> {
  return load();
}`,
  },
  {
    name: 'satisfies keeps the cancelable type',
    code: `${HEAD}
const kept = load() satisfies Promise<number>;`,
  },
  {
    name: 'Promise.resolve is an explicit adoption',
    code: `${HEAD}
track(Promise.resolve(load()));`,
  },
  {
    name: 'new Promise with arrow shorthand resolve is an explicit adoption',
    code: `${HEAD}
track(new Promise((resolve) => resolve(load())));`,
  },
  {
    name: 'new Promise with a block body resolve is an explicit adoption',
    code: `${HEAD}
track(new Promise((resolve) => { resolve(load()); }));`,
  },
  {
    name: 'as cast is sanctioned by default',
    code: `${HEAD}
track(load() as Promise<number>);`,
  },
  {
    name: 'double as unknown as cast is sanctioned by default',
    code: `${HEAD}
track(load() as unknown as Promise<number>);`,
  },
  {
    name: 'angle bracket cast is sanctioned by default',
    code: `${HEAD}
track(<Promise<number>>load());`,
  },
  {
    name: 'boundary helper hands the flow to a terminal consumer',
    code: `import CancelablePromise, { catchCancel } from '@cancjs/promise';
declare function load(): CancelablePromise<number>;
declare function track(p: PromiseLike<unknown>): void;
track(catchCancel(load()));`,
  },
  {
    name: 'renamed boundary import is resolved through the import binding',
    code: `import CancelablePromise, { suppressCancel as quiet } from '@cancjs/promise';
declare function load(): CancelablePromise<number>;
declare function track(p: PromiseLike<unknown>): void;
track(quiet(load()));`,
  },
  {
    name: 'union sink keeps the capability visible',
    code: `${HEAD}
declare function schedule(p: Promise<number> | CancelablePromise<number>): void;
schedule(load());`,
  },
  {
    name: 'generic sink constrained to Promise infers the cancelable type',
    code: `${HEAD}
declare function keep<T extends Promise<any>>(p: T): T;
keep(load());`,
  },
  {
    name: 'non-null assertion does not widen',
    code: `${HEAD}
declare const maybe: CancelablePromise<number> | undefined;
const sure = maybe!;`,
  },
  {
    name: 'lazy promise source is not cancelable promise erasure',
    code: `import { LazyPromise } from '@cancjs/toolbox';
declare function lazyLoad(): LazyPromise<number>;
declare function track(p: Promise<number>): void;
track(lazyLoad());`,
  },
  {
    name: 'plain promise into a plain sink',
    code: `declare function track(p: Promise<number>): void;
declare function plain(): Promise<number>;
track(plain());`,
  },
  {
    name: 'callback return adopted by a then chain',
    code: `${HEAD}
load().then(() => load());`,
  },
  {
    name: 'canc-declared callee adopts the cancelable on purpose',
    code: `${HEAD}
CancelablePromise.resolve(load());`,
  },
  {
    name: 'withResolvers promise comes with its own cancel',
    code: `${HEAD}
function run() {
  const { promise, cancel } = CancelablePromise.withResolvers<number>();
  track(promise);
  return cancel;
}`,
  },
  {
    name: 'value started with a local controller signal has a cancel path',
    code: `import CancelablePromise from '@cancjs/promise';
declare function start(options: { signal: AbortSignal }): CancelablePromise<number>;
declare function track(p: Promise<number>): void;
function run() {
  const controller = new AbortController();
  const job = start({ signal: controller.signal });
  track(job);
  return controller;
}`,
  },
  {
    name: 'handle passed as a ref option keeps a cancel path',
    code: `${HEAD}
declare class Holder { constructor(options: { ref: unknown }); }
const job = load();
track(job);
new Holder({ ref: job });`,
  },
  {
    name: 'native combinator arguments are left to prefer-canc-combinators',
    code: `${HEAD}
Promise.all([load()]);`,
  },
  {
    name: 'await operand is not a sink of this rule',
    code: `${HEAD}
async function run() {
  return (await load()) + 1;
}`,
  },
  {
    name: 'floating statement is not a sink of this rule',
    code: `${HEAD}
load();`,
  },
  {
    name: 'configured project boundary helper is sanctioned',
    code: `${HEAD}
declare function detach<T>(p: CancelablePromise<T>): Promise<T>;
declare function sink(p: PromiseLike<unknown>): void;
sink(detach(load()));`,
    settings: { canc: { boundaryFunctions: ['detach'] } },
  },
  {
    name: 'allowAnnotationWidening accepts an annotated variable',
    code: `${HEAD}
const pending: Promise<number> = load();`,
    options: [{ allowAnnotationWidening: true }],
  },
  {
    name: 'checkArguments false skips arguments',
    code: `${HEAD}
track(load());`,
    options: [{ checkArguments: false }],
  },
  {
    name: 'checkReturns false skips returns',
    code: `${HEAD}
function run(): Promise<number> {
  return load();
}`,
    options: [{ checkReturns: false }],
  },
  {
    name: 'checkAssignments false skips annotated variables',
    code: `${HEAD}
const pending: Promise<number> = load();`,
    options: [{ checkAssignments: false }],
  },
  {
    name: 'checkProperties false skips properties',
    code: `${HEAD}
const holder: { job: Promise<number> } = { job: Promise.resolve(1) };
holder.job = load();`,
    options: [{ checkProperties: false }],
  },
  {
    name: 'allowForKnownSafeSinks accepts a listed callee',
    code: `${HEAD}
track(load());`,
    options: [{ allowForKnownSafeSinks: [{ from: 'file', name: 'track' }] }],
  },
];

const invalid: InvalidTestCase<MessageIds, Options>[] = [
  {
    name: 'direct call argument into a Promise parameter',
    code: `${HEAD}
track(load());`,
    errors: [{ messageId: 'erasedArgument', line: 4, column: 7 }],
  },
  {
    name: 'return through a declared Promise return type',
    code: `${HEAD}
function run(): Promise<number> {
  return load();
}`,
    errors: [{ messageId: 'erasedReturn', line: 5, column: 10 }],
  },
  {
    name: 'async function return through a declared Promise return type',
    code: `${HEAD}
async function run(): Promise<number> {
  return load();
}`,
    errors: [{ messageId: 'erasedReturn', line: 5, column: 10 }],
  },
  {
    name: 'arrow implicit return with an explicit Promise return type',
    code: `${HEAD}
const run = (): Promise<number> => load();`,
    errors: [{ messageId: 'erasedReturn', line: 4, column: 36 }],
  },
  {
    name: 'arrow implicit return under an annotated variable',
    code: `${HEAD}
const run: () => Promise<number> = () => load();`,
    errors: [{ messageId: 'erasedReturn', line: 4, column: 42 }],
  },
  {
    name: 'annotation widening on a variable',
    code: `${HEAD}
const pending: Promise<number> = load();`,
    errors: [{ messageId: 'erasedAssignment', line: 4, column: 34 }],
  },
  {
    name: 'reassignment to a let typed Promise',
    code: `${HEAD}
let pending: Promise<number> = Promise.resolve(1);
pending = load();`,
    errors: [{ messageId: 'erasedAssignment', line: 5, column: 11 }],
  },
  {
    name: 'array element under an annotated container',
    code: `${HEAD}
const all: Promise<number>[] = [load()];`,
    errors: [{ messageId: 'erasedAssignment', line: 4, column: 33 }],
  },
  {
    name: 'PromiseLike parameter is a sink too',
    code: `${HEAD}
declare function enqueue(p: PromiseLike<number>): void;
enqueue(load());`,
    errors: [{ messageId: 'erasedArgument', line: 5, column: 9 }],
  },
  {
    name: 'class field typed Promise',
    code: `${HEAD}
class Store {
  pending: Promise<number> = load();
}`,
    errors: [{ messageId: 'erasedProperty', line: 5, column: 30 }],
  },
  {
    name: 'object literal property under a contextual Promise type',
    code: `${HEAD}
const holder: { job: Promise<number> } = { job: load() };`,
    errors: [{ messageId: 'erasedProperty', line: 4, column: 49 }],
  },
  {
    name: 'member assignment to a Promise typed property',
    code: `${HEAD}
const holder: { job: Promise<number> } = { job: Promise.resolve(1) };
holder.job = load();`,
    errors: [{ messageId: 'erasedProperty', line: 5, column: 14 }],
  },
  {
    name: 'local without a cancel path is reported',
    code: `${HEAD}
const job = load();
track(job);`,
    errors: [{ messageId: 'erasedArgument', line: 5, column: 7 }],
  },
  {
    name: 'retainedHandle false reports a local with a cancel path',
    code: `${HEAD}
const job = load();
track(job);
job.cancel();`,
    options: [{ retainedHandle: false }],
    errors: [{ messageId: 'erasedArgument', line: 5, column: 7 }],
  },
  {
    name: 'allowAsCast false reports the cast',
    code: `${HEAD}
track(load() as Promise<number>);`,
    options: [{ allowAsCast: false }],
    errors: [{ messageId: 'erasedArgument', line: 4, column: 7 }],
  },
  {
    name: 'allowExplicitWrap false reports Promise.resolve',
    code: `${HEAD}
track(Promise.resolve(load()));`,
    options: [{ allowExplicitWrap: false }],
    errors: [{ messageId: 'erasedArgument', line: 4, column: 7 }],
  },
  {
    name: 'shadowed Promise.resolve is not an explicit adoption',
    code: `${HEAD}
function run(Promise: { resolve(p: Promise<number>): void }) {
  Promise.resolve(load());
}`,
    errors: [{ messageId: 'erasedArgument', line: 5, column: 19 }],
  },
  {
    name: 'renamed CancelablePromise import is resolved through its type',
    code: `import { CancelablePromise as Job } from '@cancjs/promise';
declare function load(): Job<number>;
declare function track(p: Promise<number>): void;
track(load());`,
    errors: [{ messageId: 'erasedArgument', line: 4, column: 7 }],
  },
  {
    name: 'overloaded callee resolves the matching parameter',
    code: `${HEAD}
declare function put(key: string, p: Promise<number>): void;
declare function put(p: Promise<number>): void;
put('a', load());`,
    errors: [{ messageId: 'erasedArgument', line: 6, column: 10 }],
  },
  {
    name: 'rest parameter of Promise elements',
    code: `${HEAD}
declare function many(...ps: Promise<number>[]): void;
many(load(), load());`,
    errors: [
      { messageId: 'erasedArgument', line: 5, column: 6 },
      { messageId: 'erasedArgument', line: 5, column: 14 },
    ],
  },
  {
    name: 'satisfies does not adopt: the sink still erases',
    code: `${HEAD}
track(load() satisfies Promise<number>);`,
    errors: [{ messageId: 'erasedArgument', line: 4, column: 7 }],
  },
  {
    name: 'non-null assertion into a Promise parameter',
    code: `${HEAD}
declare const maybe: CancelablePromise<number> | undefined;
track(maybe!);`,
    errors: [{ messageId: 'erasedArgument', line: 5, column: 7 }],
  },
  {
    name: 'then chain result keeps the cancelable type and still erases',
    code: `${HEAD}
track(load().then((n) => n + 1));`,
    errors: [{ messageId: 'erasedArgument', line: 4, column: 7 }],
  },
  {
    name: 'allowForKnownSafeSinks does not cover other callees',
    code: `${HEAD}
declare function other(p: Promise<number>): void;
other(load());`,
    options: [{ allowForKnownSafeSinks: [{ from: 'file', name: 'track' }] }],
    errors: [{ messageId: 'erasedArgument', line: 5, column: 7 }],
  },
];

describe('canc/no-cancelability-erasure', () => {
  ruleTester({ types: true }).run('no-cancelability-erasure', rule, { valid, invalid });

  ruleTester({ types: false }).run('no-cancelability-erasure without type information', rule, {
    valid: invalid.map(({ name, code, options }) => ({ name: `untyped: ${name}`, code, ...(options && { options }) })),
    invalid: [],
  });
});

describe('no-cancelability-erasure typed corpus lane', () => {
  it('matches the markers of every flow twin', async () => {
    (plugin.rules as Record<string, unknown>)['no-cancelability-erasure'] = rule;
    const linter = createTypedCorpusLinter([{ rules: { 'canc/no-cancelability-erasure': 'error' } }]);

    const results = await linter.lintFiles([...invalidTwins, ...validTwins]);
    expect(results).toHaveLength(invalidTwins.length + validTwins.length);

    for (const result of results) {
      const name = path.relative(flowDir, result.filePath).replaceAll('\\', '/');
      const markers = name.startsWith('valid/') ? [] : readMarkers(result.filePath);
      if (!name.startsWith('valid/')) {
        expect(markers.length, name).toBeGreaterThan(0);
      }
      expect(
        result.messages.map((m) => `${name}:${m.line} ${m.ruleId}`),
        name,
      ).toEqual(markers.map((m) => `${name}:${m.line} canc/no-cancelability-erasure`));
      for (const [i, marker] of markers.entries()) {
        if (marker.messageId) {
          expect(result.messages[i]?.messageId, name).toBe(marker.messageId);
        }
      }
    }
  });
});
