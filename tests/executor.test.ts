import tseslintParser from '@typescript-eslint/parser';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
import { describe, expect, it } from 'vitest';

import { analyzeExecutor, type ExecutorShape } from '../src/util/executor.js';

const IMPORT_CANC = `import { CancelablePromise } from '@cancjs/promise';\n`;
const IMPORT_LAZY = `import { LazyPromise } from '@cancjs/toolbox';\n`;

/**
 * Run `analyzeExecutor` on the first `new` expression in `code` through a real
 * Linter and return its shape (or null). Type information is not required: the
 * analyzer is purely syntactic.
 */
function shapeFor(code: string): ExecutorShape | null {
  let captured: ExecutorShape | null = null;
  const captureRule: TSESLint.RuleModule<'x', []> = {
    meta: { type: 'problem', messages: { x: 'x' }, schema: [] },
    defaultOptions: [],
    create(context) {
      return {
        NewExpression(node: TSESTree.NewExpression) {
          if (captured) {
            return;
          }
          captured = analyzeExecutor(node, context);
        },
      };
    },
  };
  const linter = new Linter();
  linter.verify(code, {
    languageOptions: { parser: tseslintParser, sourceType: 'module' },
    plugins: { probe: { rules: { capture: captureRule } } },
    rules: { 'probe/capture': 'error' },
  });
  return captured;
}

/** Coarse projection of a shape to primitives, for table assertions. */
function fields(shape: ExecutorShape | null) {
  expect(shape).not.toBeNull();
  const s = shape!;
  return {
    ctorKind: s.ctorKind,
    hasHandleCancelParam: s.params.handleCancel !== undefined,
    isAsync: s.isAsync,
    asyncDriverInside: s.asyncDriverInside,
    operationCount: s.operationStarts.length,
    transformsBeforeResolve: s.transformsBeforeResolve,
    handleCancelCount: s.handleCancelCalls.length,
    lateHandleCancel: s.handleCancelCalls.some((c) => c.late),
    signalReadCount: s.signalReads.length,
    returnsValue: s.returnsValue,
    returnsFunction: s.returnsFunction,
    hasOptions: s.ctorOptionsNode !== undefined,
    contextKind: s.contextKind,
    getSignalCount: s.getSignalCalls.length,
    signalForwarded: s.signalForwarded,
    controllerForwarded: s.controllerForwarded ?? false,
    asyncDriverCount: s.asyncDriverCalls?.length ?? 0,
  };
}

describe('analyzeExecutor: non-tracked ctors', () => {
  it('returns null for a plain Promise', () => {
    expect(shapeFor(`const p = new Promise((resolve) => resolve(1));`)).toBeNull();
  });

  it('returns null when ctor is imported from a non-canc source', () => {
    expect(shapeFor(`import { CancelablePromise } from 'bluebird'; new CancelablePromise(() => {});`)).toBeNull();
  });

  it('returns null when the first argument is not a function', () => {
    expect(shapeFor(`${IMPORT_CANC}const p = new CancelablePromise(notAFn);`)).toBeNull();
  });
});

// executor.md corpus shapes

describe('no-async-executor corpus', () => {
  it('Incorrect: async executor -> isAsync', () => {
    const code = `${IMPORT_CANC}
 const cancPromise = new CancelablePromise<string[]>(async (resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 try {
 const data = await fetchTitlesRaw(controller.signal);
 resolve(data.map((item) => item.title));
 } catch (err) {
 reject(err);
 }
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      ctorKind: 'cancelable',
      isAsync: true,
      hasHandleCancelParam: true,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('Incorrect: async IIFE driver -> asyncDriverInside', () => {
    const code = `${IMPORT_CANC}
 const cancPromise = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 (async () => {
 resolve(await buildReport(controller.signal));
 })().catch(reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      isAsync: false,
      asyncDriverInside: true,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('Correct: synchronous adapter -> clean', () => {
    const code = `${IMPORT_CANC}
 const cancPromise = new CancelablePromise<RawTitle[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchTitlesRaw(controller.signal).then(resolve, reject);
 }).then((data) => data.map((item) => item.title));`;
    expect(fields(shapeFor(code))).toMatchObject({
      isAsync: false,
      asyncDriverInside: false,
      operationCount: 1,
      transformsBeforeResolve: false,
      handleCancelCount: 1,
      lateHandleCancel: false,
      signalReadCount: 1,
      returnsValue: false,
      returnsFunction: false,
    });
  });

  it('Correct: single-operation adapter -> clean', () => {
    const code = `${IMPORT_CANC}
 const cancPromise = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 buildReport(controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      isAsync: false,
      operationCount: 1,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });
});

describe('no-multistep-executor corpus', () => {
  it('Incorrect: two chained operations -> operationCount 2', () => {
    const code = `${IMPORT_CANC}
 const checkout = new CancelablePromise<void>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 reserveStock(controller.signal)
 .then(() => chargeCard(controller.signal))
 .then(() => resolve(), reject);
 });`;
    // reserveStock(...) is the chain head; chargeCard(...) sits inside a then callback (nested).
    expect(fields(shapeFor(code)).operationCount).toBeGreaterThanOrEqual(2);
  });

  it('Incorrect: async IIFE with two awaited operations -> multi op + async driver', () => {
    const code = `${IMPORT_CANC}
 const checkout = new CancelablePromise<void>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 (async () => {
 await stepOne(controller.signal);
 await stepTwo(controller.signal);
 resolve();
 })().catch(reject);
 });`;
    const f = fields(shapeFor(code));
    expect(f.asyncDriverInside).toBe(true);
    expect(f.operationCount).toBeGreaterThanOrEqual(2);
  });

  it('Correct: single-operation adapter factory -> operationCount 1', () => {
    const code = `${IMPORT_CANC}
 function reserveStockCancelable(): CancelablePromise<void> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 reserveStock(controller.signal).then(resolve, reject);
 });
 }`;
    expect(fields(shapeFor(code))).toMatchObject({
      operationCount: 1,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });
});

describe('no-transform-in-executor corpus', () => {
  it('Incorrect: resolve(data.map(...)) -> transformsBeforeResolve', () => {
    const code = `${IMPORT_CANC}
 const titles = new CancelablePromise<string[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchTitlesRaw(controller.signal).then(
 (data) => resolve(data.map((item) => item.title)),
 reject,
 );
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      transformsBeforeResolve: true,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('Correct: raw resolve, transform in chain -> no transform', () => {
    const code = `${IMPORT_CANC}
 const titles = new CancelablePromise<RawTitle[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchTitlesRaw(controller.signal).then(resolve, reject);
 }).then((data) => data.map((item) => item.title));`;
    expect(fields(shapeFor(code)).transformsBeforeResolve).toBe(false);
  });
});

describe('handle-cancel-first corpus', () => {
  it('Incorrect: handleCancel inside a then callback -> lateHandleCancel', () => {
    const code = `${IMPORT_CANC}
 const download = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 openStream().then((stream) => {
 handleCancel(() => stream.destroy());
 readAll(stream).then(resolve, reject);
 }, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      handleCancelCount: 1,
      lateHandleCancel: true,
    });
  });

  it('Correct: handleCancel synchronous at top level -> not late', () => {
    const code = `${IMPORT_CANC}
 const download = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 openStream(controller.signal)
 .then((stream) => readAll(stream, controller.signal))
 .then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      handleCancelCount: 1,
      lateHandleCancel: false,
      signalReadCount: 2,
    });
  });
});

describe('require-signal-forwarding corpus', () => {
  it('Incorrect: controller wired but signal never read -> signalReadCount 0', () => {
    const code = `${IMPORT_CANC}
 const profile = new CancelablePromise<Profile>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchProfile(userId).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      handleCancelCount: 1,
      signalReadCount: 0,
    });
  });

  it('Correct: controller.signal forwarded -> signalReadCount 1', () => {
    const code = `${IMPORT_CANC}
 const profile = new CancelablePromise<Profile>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchProfile(userId, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code)).signalReadCount).toBe(1);
  });

  it('Correct: no controller at all -> no handleCancel, no signal reads', () => {
    const code = `${IMPORT_CANC}
 const profile = new CancelablePromise<Profile>((resolve, reject) => {
 fetchProfile(userId).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      hasHandleCancelParam: false,
      handleCancelCount: 0,
      signalReadCount: 0,
    });
  });
});

describe('executor-cancel-wiring corpus', () => {
  it('Incorrect: no handleCancel param, no options -> unwired', () => {
    const code = `${IMPORT_CANC}
 const profile = new CancelablePromise<Profile>((resolve, reject) => {
 fetchProfile(userId, signalCapableButUnused).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      hasHandleCancelParam: false,
      handleCancelCount: 0,
      hasOptions: false,
    });
  });

  it('Correct: handleCancel wired -> handleCancelCount 1', () => {
    const code = `${IMPORT_CANC}
 const profile = new CancelablePromise<Profile>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchProfile(userId, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });
});

describe('ctor options object', () => {
  it('detects a signal option object as ctorOptionsNode', () => {
    const code = `${IMPORT_CANC}
 const controller = new AbortController();
 const p = new CancelablePromise<number>((resolve) => resolve(1), { signal: controller.signal });`;
    expect(fields(shapeFor(code)).hasOptions).toBe(true);
  });

  it('detects a ref option object as ctorOptionsNode', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise<number>((resolve) => resolve(1), { ref: false });`;
    expect(fields(shapeFor(code)).hasOptions).toBe(true);
  });

  it('an unrelated second-arg object is not treated as options', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise<number>((resolve) => resolve(1), { other: 1 });`;
    expect(fields(shapeFor(code)).hasOptions).toBe(false);
  });
});

// lazy.md corpus shapes

describe('lazy executor corpus', () => {
  it('must-consume-lazy: bare lazy ctor -> ctorKind lazy', () => {
    const code = `${IMPORT_LAZY}
 new LazyPromise((resolve, reject) => {
 connectAnalytics().then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      ctorKind: 'lazy',
      operationCount: 1,
    });
  });

  it('Incorrect: async lazy executor -> isAsync', () => {
    const code = `${IMPORT_LAZY}
 const feed = new LazyPromise<Feed>(async (resolve, reject) => {
 resolve(await openFeed());
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      ctorKind: 'lazy',
      isAsync: true,
      operationCount: 1,
    });
  });

  it('Incorrect: value return from lazy executor -> returnsValue', () => {
    const code = `${IMPORT_LAZY}
 const feed = new LazyPromise<Feed>((resolve, reject) => {
 return openFeed().then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      ctorKind: 'lazy',
      returnsValue: true,
      returnsFunction: false,
    });
  });

  it('Correct: teardown function return -> returnsFunction', () => {
    const code = `${IMPORT_LAZY}
 const feed = new LazyPromise<Feed>((resolve, reject) => {
 const socket = openFeedSocket();
 socket.onData(resolve);
 socket.onError(reject);
 return () => socket.close();
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      ctorKind: 'lazy',
      returnsFunction: true,
      returnsValue: false,
    });
  });

  it('Correct: handleCancel-wired lazy executor -> clean adapter', () => {
    const code = `${IMPORT_LAZY}
 const feed = new LazyPromise<Feed>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 openFeed(controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      ctorKind: 'lazy',
      handleCancelCount: 1,
      signalReadCount: 1,
      operationCount: 1,
      returnsValue: false,
      returnsFunction: false,
    });
  });
});

describe('executor context and getSignal', () => {
  it('destructured { handleCancel } wiring', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      lateHandleCancel: false,
      signalReadCount: 1,
      getSignalCount: 0,
      signalForwarded: false,
    });
  });

  it('destructured { handleCancel: hc } rename', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel: hc }) => {
 const controller = new AbortController();
 hc(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('destructured late handleCancel reports late: true', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 openStream().then((stream) => {
 handleCancel(() => stream.destroy());
 readAll(stream).then(resolve, reject);
 }, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      lateHandleCancel: true,
    });
  });

  it('ctx identifier handleCancel member call', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, ctx) => {
 const controller = new AbortController();
 ctx.handleCancel(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'identifier',
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('ctx identifier getSignal forwarded directly into fetch', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, ctx) => {
 fetch(url, { signal: ctx.getSignal() }).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'identifier',
      getSignalCount: 1,
      signalForwarded: true,
    });
  });

  it('destructured getSignal forwarded directly into fetch options', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { getSignal }) => {
 fetch(url, { signal: getSignal() }).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      getSignalCount: 1,
      signalForwarded: true,
    });
  });

  it('destructured getSignal assigned to variable and forwarded into fetch', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { getSignal }) => {
 const signal = getSignal();
 fetch(url, { signal }).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      getSignalCount: 1,
      signalForwarded: true,
    });
  });

  it('destructured getSignal call result discarded -> signalForwarded false', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { getSignal }) => {
 getSignal();
 fetch(url).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      getSignalCount: 1,
      signalForwarded: false,
    });
  });

  it('executor with no 3rd param -> contextKind none', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject) => {
 fetch(url).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'none',
      hasHandleCancelParam: false,
      handleCancelCount: 0,
    });
  });

  it('async executor with context', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise(async (resolve, reject, { handleCancel }) => {
 handleCancel(() => {});
 resolve(await fetch(url));
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      isAsync: true,
      handleCancelCount: 1,
    });
  });

  it('synchronous-throw executor still classifies', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 handleCancel(() => {});
 throw new Error('immediate failure');
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
    });
  });

  it('positional legacy handleCancel parameter classifies as legacyFn', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'legacyFn',
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('destructured defaults on context parameter', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel = () => {} }) => {
 handleCancel();
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
    });
  });

  it('positional legacy hc parameter classifies as legacyFn', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, hc) => {
 const controller = new AbortController();
 hc(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'legacyFn',
      hasHandleCancelParam: true,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('positional legacy _handleCancel parameter classifies as legacyFn', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, _handleCancel) => {
 const controller = new AbortController();
 _handleCancel(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'legacyFn',
      hasHandleCancelParam: true,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('positional legacy _hc parameter classifies as legacyFn', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, _hc) => {
 const controller = new AbortController();
 _hc(() => controller.abort());
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'legacyFn',
      hasHandleCancelParam: true,
      handleCancelCount: 1,
      signalReadCount: 1,
    });
  });

  it('positional legacy parameter with assignment default classifies as legacyFn', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, hc = () => {}) => {
 hc();
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'legacyFn',
      hasHandleCancelParam: true,
      handleCancelCount: 1,
    });
  });

  it('named async function driver reports asyncDriverInside and asyncDriverCalls', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 async function run() {
 resolve(await buildReport(controller.signal));
 }
 run().catch(reject);
 });`;
    const shape = shapeFor(code);
    expect(fields(shape)).toMatchObject({
      asyncDriverInside: true,
      asyncDriverCount: 1,
    });
    expect(shape?.asyncDriverCalls).toHaveLength(1);
  });

  it('named async arrow driver reports asyncDriverInside and asyncDriverCalls', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 const run = async () => {
 resolve(await buildReport(controller.signal));
 };
 run();
 });`;
    const shape = shapeFor(code);
    expect(fields(shape)).toMatchObject({
      asyncDriverInside: true,
      asyncDriverCount: 1,
    });
    expect(shape?.asyncDriverCalls).toHaveLength(1);
  });

  it('async executor with named async driver exposes both', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise(async (resolve, reject, { handleCancel }) => {
 handleCancel(() => {});
 async function helper() {
 await fetch(url);
 }
 helper();
 resolve(await fetch(url));
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      isAsync: true,
      asyncDriverInside: true,
      asyncDriverCount: 1,
    });
  });

  it('operation inside handleCancel cleanup callback is excluded from operationStarts', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 handleCancel(() => {
 cleanupService().then(() => {});
 });
 fetch(url).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      operationCount: 1,
      handleCancelCount: 1,
    });
  });

  it('operation inside ctx.handleCancel cleanup callback is excluded from operationStarts', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, ctx) => {
 ctx.handleCancel(async () => {
 await closeConnection();
 });
 fetch(url).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'identifier',
      operationCount: 1,
      handleCancelCount: 1,
    });
  });

  it('operation inside uninvoked nested function declaration is excluded from operationStarts', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject) => {
 function unusedHelper() {
 fetch('/aux').then(resolve);
 }
 fetch('/primary').then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      operationCount: 1,
    });
  });

  it('operation inside invoked nested function declaration is included in operationStarts', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject) => {
 function activeHelper() {
 fetch('/primary').then(resolve);
 }
 activeHelper();
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      operationCount: 1,
    });
  });

  it('destructured const { signal } = controller records signal reads', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 const { signal } = controller;
 fetch(url, { signal }).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      signalReadCount: 1,
      controllerForwarded: false,
    });
  });

  it('destructured const { signal: s } = controller with rename records signal reads', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 const { signal: s } = controller;
 fetch(url, s).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      signalReadCount: 1,
      controllerForwarded: false,
    });
  });

  it('destructured const { signal } = controller unused yields zero signal reads', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 const { signal } = controller;
 fetch(url).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      signalReadCount: 0,
      controllerForwarded: false,
    });
  });

  it('whole-controller forwarding fn(controller) sets controllerForwarded true', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 forwardController(url, controller).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      signalReadCount: 0,
      controllerForwarded: true,
    });
  });

  it('destructured late handleCancel with controller wiring', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 const controller = new AbortController();
 setTimeout(() => {
 handleCancel(() => controller.abort());
 }, 100);
 fetch(url, controller.signal).then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      contextKind: 'destructured',
      handleCancelCount: 1,
      lateHandleCancel: true,
      signalReadCount: 1,
    });
  });

  it('multiple distinct operations counted when outside cleanup callback', () => {
    const code = `${IMPORT_CANC}
 const p = new CancelablePromise((resolve, reject, { handleCancel }) => {
 handleCancel(() => {});
 fetch('/first').then(() => {});
 fetch('/second').then(resolve, reject);
 });`;
    expect(fields(shapeFor(code))).toMatchObject({
      operationCount: 2,
    });
  });
});
