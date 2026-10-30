import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvalidTestCase, ValidTestCase } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import type { MessageIds, RuleOptions as Options } from '../../src/rules/no-await-cancelable-in-async.js';
import rule from '../../src/rules/no-await-cancelable-in-async.js';
import { readMarkers } from '../helpers/corpus.js';
import { createTypedCorpusLinter } from '../helpers/typed-corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const flowDir = path.resolve(__dirname, '../fixtures/corpus/flow');

const invalidTwins = [
  'invalid/05-no-await-cancelable-in-async.ts',
  'invalid/09-no-await-cancelable-in-async-nested-in-coroutine.ts',
].map((file) => path.join(flowDir, file));

const validTwins = [
  'valid/08-no-await-cancelable-in-async-coroutine-fix.ts',
  'valid/09-no-await-cancelable-in-async-boundary-form.ts',
  'valid/10-no-await-cancelable-in-async-explicit-adoption.ts',
  'valid/14-floating-cancelables-interop.ts',
  'valid/18-no-await-cancelable-in-async-await-cancel.ts',
  'valid/19-no-await-cancelable-in-async-error-matcher-boundary.ts',
  'valid/96-adversarial-plain-await-with-cancelable-variable.ts',
  'valid/97-adversarial-async-helper-awaits-cancel.ts',
].map((file) => path.join(flowDir, file));

const HEAD = `import CancelablePromise, { catchCancel, suppressCancel } from '@cancjs/promise';
declare function load(): CancelablePromise<number>;
declare function plain(): Promise<number>;`;

const valid: ValidTestCase<Options>[] = [
  {
    name: 'plain promise await is not checked',
    code: `${HEAD}
async function run() {
  await plain();
}`,
  },
  {
    name: 'awaiting cancel waits for cleanup',
    code: `${HEAD}
async function run() {
  const job = load();
  await job.cancel();
}`,
  },
  {
    name: 'optional cancel call is also cleanup',
    code: `${HEAD}
declare const job: CancelablePromise<number> | undefined;
async function run() {
  await job?.cancel();
}`,
  },
  {
    name: 'catchCancel boundary consumes the flow',
    code: `${HEAD}
async function run() {
  await catchCancel(load());
}`,
  },
  {
    name: 'suppressCancel boundary consumes the flow',
    code: `${HEAD}
async function run() {
  await suppressCancel(load());
}`,
  },
  {
    name: 'renamed boundary import is tracked',
    code: `import CancelablePromise, { catchCancel as settle } from '@cancjs/promise';
declare function load(): CancelablePromise<number>;
async function run() {
  await settle(load());
}`,
  },
  {
    name: 'configured boundary function is a boundary',
    code: `${HEAD}
declare function finish<T>(p: CancelablePromise<T>): CancelablePromise<T>;
async function run() {
  await finish(load());
}`,
    settings: { canc: { boundaryFunctions: ['finish'] } },
  },
  {
    name: 'Promise.resolve is an explicit adoption',
    code: `${HEAD}
async function run() {
  await Promise.resolve(load());
}`,
  },
  {
    name: 'as cast is an explicit adoption',
    code: `${HEAD}
async function run() {
  await (load() as Promise<number>);
}`,
  },
  {
    name: 'top-level await is allowed by default',
    code: `${HEAD}
await load();
export {};`,
  },
  {
    name: 'allowInFunctions exact declaration name',
    code: `${HEAD}
async function main() {
  await load();
}`,
    options: [{ allowInFunctions: ['main'] }],
  },
  {
    name: 'allowInFunctions regex matches an arrow variable name',
    code: `${HEAD}
const handleClick = async () => {
  await load();
};`,
    options: [{ allowInFunctions: ['/^handle/u'] }],
  },
  {
    name: 'allowInFunctions matches a method key',
    code: `${HEAD}
class Page {
  async handleSubmit() {
    await load();
  }
}`,
    options: [{ allowInFunctions: ['/^handle/u'] }],
  },
  {
    name: 'allowInFunctions matches an object property key',
    code: `${HEAD}
const api = {
  run: async () => {
    await load();
  },
};`,
    options: [{ allowInFunctions: ['run'] }],
  },
  {
    name: 'union with a plain promise member is not flagged',
    code: `${HEAD}
declare const either: Promise<number> | CancelablePromise<number>;
async function run() {
  await either;
}`,
  },
  {
    name: 'lazy promise await is not cancelable-promise erasure',
    code: `import { LazyPromise } from '@cancjs/toolbox';
declare function session(): LazyPromise<number>;
async function run() {
  await session();
}`,
  },
  {
    name: 'coroutine body uses cancAwait, not await',
    code: `${HEAD}
import { cancAsync, cancAwait } from '@cancjs/coroutine';
const run = cancAsync(function* () {
  yield* cancAwait(load());
});`,
  },
  {
    name: 'for await over plain promises is silent',
    code: `${HEAD}
async function run(items: Promise<number>[]) {
  for await (const n of items) {
    void n;
  }
}`,
  },
  {
    name: 'for await over a Set of cancelables is silent in this version',
    code: `${HEAD}
async function run(items: Set<CancelablePromise<number>>) {
  for await (const n of items) {
    void n;
  }
}`,
  },
  {
    name: 'for await at top level is allowed by default',
    code: `${HEAD}
declare const items: CancelablePromise<number>[];
for await (const n of items) {
  void n;
}
export {};`,
  },
  {
    name: 'non-async nested function inside an async function is not the await scope',
    code: `${HEAD}
async function run() {
  const later = () => load();
  await plain();
  return later;
}`,
  },
];

const invalid: InvalidTestCase<MessageIds, Options>[] = [
  {
    name: 'await of a cancelable call in an async function',
    code: `${HEAD}
async function run() {
  const n = await load();
  return n;
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 5, column: 19 }],
  },
  {
    name: 'await of a cancelable variable',
    code: `${HEAD}
async function run() {
  const job = load();
  await job;
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 6, column: 9 }],
  },
  {
    name: 'async arrow in event-handler position is flagged without allowInFunctions',
    code: `${HEAD}
declare const button: { addEventListener(type: string, cb: () => void): void };
button.addEventListener('click', async () => {
  await load();
});`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 6, column: 9 }],
  },
  {
    name: 'async function nested in a coroutine body is a plain async function',
    code: `${HEAD}
import { cancAsync, cancAwait } from '@cancjs/coroutine';
const routine = cancAsync(function* () {
  const inner = async () => {
    await load();
  };
  yield* cancAwait(inner());
});`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 7, column: 11 }],
  },
  {
    name: 'async method',
    code: `${HEAD}
class Store {
  async refresh() {
    await load();
  }
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 6, column: 11 }],
  },
  {
    name: 'allowInFunctions does not cover other names',
    code: `${HEAD}
async function refresh() {
  await load();
}`,
    options: [{ allowInFunctions: ['/^handle/u', 'main'] }],
    errors: [{ messageId: 'awaitErasesCancelability', line: 5, column: 9 }],
  },
  {
    name: 'allowInFunctions on an outer function does not cover a nested async function',
    code: `${HEAD}
async function main() {
  const step = async () => {
    await load();
  };
  await step();
}`,
    options: [{ allowInFunctions: ['main'] }],
    errors: [{ messageId: 'awaitErasesCancelability', line: 6, column: 11 }],
  },
  {
    name: 'allowTopLevel false reports a top-level await',
    code: `${HEAD}
await load();
export {};`,
    options: [{ allowTopLevel: false }],
    errors: [{ messageId: 'awaitErasesCancelability', line: 4, column: 7 }],
  },
  {
    name: 'renamed CancelablePromise import is resolved through its type',
    code: `import { CancelablePromise as Job } from '@cancjs/promise';
declare function load(): Job<number>;
async function run() {
  await load();
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 4, column: 9 }],
  },
  {
    name: 'cancelable or undefined is still cancelable',
    code: `${HEAD}
declare const maybe: CancelablePromise<number> | undefined;
async function run() {
  await maybe;
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 6, column: 9 }],
  },
  {
    name: 'then chain keeps the cancelable type',
    code: `${HEAD}
async function run() {
  await load().then((n) => n + 1);
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 5, column: 9 }],
  },
  {
    name: 'a call named like a boundary but not imported from canc is not a boundary',
    code: `${HEAD}
declare function catchAll<T>(p: CancelablePromise<T>): CancelablePromise<T>;
async function run() {
  await catchAll(load());
}`,
    errors: [{ messageId: 'awaitErasesCancelability', line: 6, column: 9 }],
  },
  {
    name: 'for await over an array of cancelables',
    code: `${HEAD}
async function run(items: CancelablePromise<number>[]) {
  for await (const n of items) {
    void n;
  }
}`,
    errors: [{ messageId: 'forAwaitErasesCancelability', line: 5, column: 25 }],
  },
  {
    name: 'for await over a tuple of cancelables',
    code: `${HEAD}
async function run() {
  for await (const n of [load(), load()] as const) {
    void n;
  }
}`,
    errors: [{ messageId: 'forAwaitErasesCancelability', line: 5, column: 25 }],
  },
  {
    name: 'two awaits report each awaited argument',
    code: `${HEAD}
async function run() {
  await load();
  await plain();
  await load();
}`,
    errors: [
      { messageId: 'awaitErasesCancelability', line: 5, column: 9 },
      { messageId: 'awaitErasesCancelability', line: 7, column: 9 },
    ],
  },
];

describe('canc/no-await-cancelable-in-async', () => {
  ruleTester({ types: true }).run('no-await-cancelable-in-async', rule, { valid, invalid });

  ruleTester({ types: false }).run('no-await-cancelable-in-async without type information', rule, {
    valid: invalid.map(({ name, code, options }) => ({ name: `untyped: ${name}`, code, ...(options && { options }) })),
    invalid: [],
  });
});

describe('no-await-cancelable-in-async typed corpus lane', () => {
  it('matches the markers of every flow twin', async () => {
    (plugin.rules as Record<string, unknown>)['no-await-cancelable-in-async'] = rule;
    const linter = createTypedCorpusLinter([{ rules: { 'canc/no-await-cancelable-in-async': 'error' } }]);

    const results = await linter.lintFiles([...invalidTwins, ...validTwins]);
    expect(results).toHaveLength(invalidTwins.length + validTwins.length);

    for (const result of results) {
      const name = path.relative(flowDir, result.filePath).replaceAll('\\', '/');
      const markers = name.startsWith('valid/') ? [] : readMarkers(result.filePath);
      if (!name.startsWith('valid/')) {
        expect(markers.length, name).toBeGreaterThan(0);
      }
      // the lane runs one rule, so directives for other rules show up as unused
      const own = result.messages.filter((m) => m.ruleId === 'canc/no-await-cancelable-in-async');
      expect(
        result.messages.filter((m) => m.fatal),
        name,
      ).toEqual([]);
      expect(
        own.map((m) => `${name}:${m.line} ${m.ruleId}`),
        name,
      ).toEqual(markers.map((m) => `${name}:${m.line} canc/no-await-cancelable-in-async`));
      for (const [i, marker] of markers.entries()) {
        if (marker.messageId) {
          expect(own[i]?.messageId, name).toBe(marker.messageId);
        }
      }
    }
  });
});
