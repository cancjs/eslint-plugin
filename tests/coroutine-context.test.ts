import tseslintParser from '@typescript-eslint/parser';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
import { describe, expect, it } from 'vitest';

import { type CoroutineContext, getCoroutineContext } from '../src/util/canc-imports.js';

interface ProbeResult {
  hasContext: boolean;
  kind?: 'cancAsync' | 'cancGenAsync';
  delegated?: boolean;
  hasCall?: boolean;
  hasOptions?: boolean;
}

function probeCode(code: string): Record<string, ProbeResult> {
  const results: Record<string, ProbeResult> = {};
  const probeRule: TSESLint.RuleModule<'probe', []> = {
    meta: {
      type: 'problem',
      messages: { probe: 'probe' },
      schema: [],
    },
    defaultOptions: [],
    create(context) {
      return {
        Identifier(node: TSESTree.Identifier) {
          if (node.name.startsWith('PROBE_')) {
            const ctx = getCoroutineContext(node, context);
            results[node.name] = {
              hasContext: ctx !== null,
              kind: ctx?.kind,
              delegated: ctx?.delegated,
              hasCall: ctx?.call !== null && ctx?.call !== undefined,
              hasOptions: ctx?.options !== null && ctx?.options !== undefined,
            };
          }
        },
      };
    },
  };

  const linter = new Linter();
  linter.verify(code, {
    languageOptions: { parser: tseslintParser, sourceType: 'module' },
    plugins: { probe: { rules: { probe: probeRule } } },
    rules: { 'probe/probe': 'error' },
  });

  return results;
}

describe('coroutine-context util', () => {
  it('direct: resolves direct cancAsync and cancGenAsync generator function expressions', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';
      cancAsync(function* () { PROBE_DIRECT_ASYNC; });
      cancGenAsync(function* () { PROBE_DIRECT_GEN; });
    `);

    expect(results['PROBE_DIRECT_ASYNC']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
    expect(results['PROBE_DIRECT_GEN']).toEqual({
      hasContext: true,
      kind: 'cancGenAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
  });

  it('renamed: resolves renamed cancAsync and cancGenAsync imports', () => {
    const results = probeCode(`
      import { cancAsync as myAsync } from '@cancjs/coroutine';
      import { cancGenAsync as myGenAsync } from '@cancjs/coroutine/gen';
      myAsync(function* () { PROBE_RENAMED_ASYNC; });
      myGenAsync(function* () { PROBE_RENAMED_GEN; });
    `);

    expect(results['PROBE_RENAMED_ASYNC']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
    expect(results['PROBE_RENAMED_GEN']).toEqual({
      hasContext: true,
      kind: 'cancGenAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
  });

  it('namespace: resolves namespace member forms canc.async and cancGen.async', () => {
    const results = probeCode(`
      import * as canc from '@cancjs/coroutine';
      import * as cancGen from '@cancjs/coroutine/gen';
      canc.async(function* () { PROBE_NS_ASYNC; });
      cancGen.async(function* () { PROBE_NS_GEN; });
    `);

    expect(results['PROBE_NS_ASYNC']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
    expect(results['PROBE_NS_GEN']).toEqual({
      hasContext: true,
      kind: 'cancGenAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
  });

  it('delegated: delegated helper inherits kind; ambiguous delegation yields null (H2)', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';

      function* singleHelper() {
        PROBE_SINGLE_DELEGATED;
      }
      cancAsync(function* () {
        yield* singleHelper();
      });

      function* ambiguousHelper() {
        PROBE_AMBIGUOUS_DELEGATED;
      }
      cancAsync(function* () {
        yield* ambiguousHelper();
      });
      cancGenAsync(function* () {
        yield* ambiguousHelper();
      });
    `);

    expect(results['PROBE_SINGLE_DELEGATED']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: true,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_AMBIGUOUS_DELEGATED']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
  });

  it('nested plain function null: non-generator function between returns null', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      cancAsync(function* () {
        function plainFn() {
          PROBE_PLAIN_FN;
        }
        const arrowFn = () => {
          PROBE_ARROW_FN;
        };
      });
    `);

    expect(results['PROBE_PLAIN_FN']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_ARROW_FN']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
  });

  it('nested plain generator null: unreferenced generator inside coroutine returns null', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      cancAsync(function* () {
        function* plainGen() {
          PROBE_PLAIN_GEN;
        }
      });
    `);

    expect(results['PROBE_PLAIN_GEN']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
  });

  it('identifier argument per H1: resolves identifier generator function passed to coroutine', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      function* declaredGen() {
        PROBE_H1_DECL;
      }
      cancAsync(declaredGen);

      const varGen = function* () {
        PROBE_H1_VAR;
      };
      cancAsync(varGen);
    `);

    expect(results['PROBE_H1_DECL']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
    expect(results['PROBE_H1_VAR']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
  });

  it('options literal read: reads options ObjectExpression from cancAsync 3rd arg and cancGenAsync 2nd arg', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';
      cancAsync(function* () { PROBE_ASYNC_OPT; }, undefined, { timeout: 100 });
      cancGenAsync(function* () { PROBE_GEN_OPT; }, { timeout: 200 });
    `);

    expect(results['PROBE_ASYNC_OPT']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: true,
    });
    expect(results['PROBE_GEN_OPT']).toEqual({
      hasContext: true,
      kind: 'cancGenAsync',
      delegated: false,
      hasCall: true,
      hasOptions: true,
    });
  });

  it('nested coroutines: inner coroutine context wins', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';
      cancAsync(function* outer() {
        PROBE_OUTER;
        cancGenAsync(function* inner() {
          PROBE_INNER;
        });
      });
    `);

    expect(results['PROBE_OUTER']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
    expect(results['PROBE_INNER']).toEqual({
      hasContext: true,
      kind: 'cancGenAsync',
      delegated: false,
      hasCall: true,
      hasOptions: false,
    });
  });

  it('transitive delegation: multi-hop helper chain propagates kind to leaves', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';

      function* leaf() {
        PROBE_LEAF;
      }
      function* intermediate() {
        PROBE_INTERMEDIATE;
        yield* leaf();
      }
      function* helper() {
        PROBE_HELPER;
        yield* intermediate();
      }
      cancAsync(function* () {
        yield* helper();
      });
    `);

    expect(results['PROBE_HELPER']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: true,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_INTERMEDIATE']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: true,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_LEAF']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: true,
      hasCall: false,
      hasOptions: false,
    });
  });

  it('transitive ambiguous delegation: ambiguous intermediate helper prevents leaves from inheriting dialect', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';

      function* leaf() {
        PROBE_AMBIG_LEAF;
      }
      function* sharedIntermediate() {
        PROBE_AMBIG_INTERMEDIATE;
        yield* leaf();
      }
      function* pathAsync() {
        yield* sharedIntermediate();
      }
      function* pathGen() {
        yield* sharedIntermediate();
      }
      cancAsync(function* () {
        yield* pathAsync();
      });
      cancGenAsync(function* () {
        yield* pathGen();
      });
    `);

    expect(results['PROBE_AMBIG_INTERMEDIATE']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_AMBIG_LEAF']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
  });

  it('cyclic delegation: terminates cleanly and propagates dialect under cycles', () => {
    const results = probeCode(`
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';

      function* cycleA(): Generator<any, any, any> {
        PROBE_CYCLE_A;
        yield* cycleB();
      }
      function* cycleB(): Generator<any, any, any> {
        PROBE_CYCLE_B;
        yield* cycleA();
      }
      cancAsync(function* () {
        yield* cycleA();
      });

      function* conflictCycle1(): Generator<any, any, any> {
        PROBE_CONFLICT_1;
        yield* conflictCycle2();
      }
      function* conflictCycle2(): Generator<any, any, any> {
        PROBE_CONFLICT_2;
        yield* conflictCycle1();
      }
      cancAsync(function* () {
        yield* conflictCycle1();
      });
      cancGenAsync(function* () {
        yield* conflictCycle2();
      });
    `);

    expect(results['PROBE_CYCLE_A']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: true,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_CYCLE_B']).toEqual({
      hasContext: true,
      kind: 'cancAsync',
      delegated: true,
      hasCall: false,
      hasOptions: false,
    });

    expect(results['PROBE_CONFLICT_1']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
    expect(results['PROBE_CONFLICT_2']).toEqual({
      hasContext: false,
      kind: undefined,
      delegated: undefined,
      hasCall: false,
      hasOptions: false,
    });
  });

  it('call expression query: getCoroutineContext resolves on the CallExpression node itself', () => {
    let directCallCtx: CoroutineContext | null = null;
    let identCallCtx: CoroutineContext | null = null;
    let assertedCallCtx: CoroutineContext | null = null;

    const probeCallRule: TSESLint.RuleModule<'callProbe', []> = {
      meta: { type: 'problem', messages: { callProbe: 'callProbe' }, schema: [] },
      defaultOptions: [],
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.type === AST_NODE_TYPES.Identifier) {
              if (node.callee.name === 'cancAsync') {
                const arg = node.arguments[0];
                if (arg?.type === AST_NODE_TYPES.FunctionExpression) {
                  directCallCtx = getCoroutineContext(node, context);
                } else if (arg?.type === AST_NODE_TYPES.Identifier) {
                  identCallCtx = getCoroutineContext(node, context);
                } else if (arg?.type === AST_NODE_TYPES.TSAsExpression) {
                  assertedCallCtx = getCoroutineContext(node, context);
                }
              }
            }
          },
        };
      },
    };

    const linter = new Linter();
    linter.verify(
      `
        import { cancAsync } from '@cancjs/coroutine';
        function* declared() {}
        cancAsync(function* () {});
        cancAsync(declared);
        cancAsync((function* () {}) as any);
      `,
      {
        languageOptions: { parser: tseslintParser, sourceType: 'module' },
        plugins: { callProbe: { rules: { callProbe: probeCallRule } } },
        rules: { 'callProbe/callProbe': 'error' },
      },
    );

    expect(directCallCtx).not.toBeNull();
    expect((directCallCtx as CoroutineContext | null)?.kind).toBe('cancAsync');
    expect(identCallCtx).not.toBeNull();
    expect((identCallCtx as CoroutineContext | null)?.kind).toBe('cancAsync');
    expect(assertedCallCtx).not.toBeNull();
    expect((assertedCallCtx as CoroutineContext | null)?.kind).toBe('cancAsync');
  });
});
