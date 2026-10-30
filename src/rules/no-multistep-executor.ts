import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'multipleOperations';
export type RuleOptions = [{ maxOperations?: number }];

function paramName(param: TSESTree.Parameter | undefined): string | undefined {
  if (param?.type === AST_NODE_TYPES.Identifier) {
    return param.name;
  }
  if (param?.type === AST_NODE_TYPES.AssignmentPattern && param.left.type === AST_NODE_TYPES.Identifier) {
    return param.left.name;
  }
  return undefined;
}

const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);

/** A chained call stands for the operation at its head: `op().then(...)` starts `op()`. */
function chainHead(call: TSESTree.CallExpression): TSESTree.CallExpression {
  let curr = call;
  while (
    curr.callee.type === AST_NODE_TYPES.MemberExpression &&
    !curr.callee.computed &&
    curr.callee.property.type === AST_NODE_TYPES.Identifier &&
    CHAIN_METHODS.has(curr.callee.property.name) &&
    curr.callee.object.type === AST_NODE_TYPES.CallExpression
  ) {
    curr = curr.callee.object;
  }
  return curr;
}

function readsName(node: TSESTree.Node, name: string): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === name;
  }
  return Object.entries(node).some(([key, value]) => {
    if (key === 'parent' || key === 'loc' || key === 'range') {
      return false;
    }
    if (node.type === AST_NODE_TYPES.MemberExpression && key === 'property' && !node.computed) {
      return false;
    }
    if (node.type === AST_NODE_TYPES.Property && key === 'key' && !node.computed) {
      return false;
    }
    const children: unknown[] = Array.isArray(value) ? value : [value];
    return children.some(
      (child) =>
        typeof child === 'object' &&
        child !== null &&
        typeof (child as TSESTree.Node).type === 'string' &&
        readsName(child as TSESTree.Node, name),
    );
  });
}

/**
 * A step that consumes the value the previous step produced (`open().then((stream) => readAll(stream))`)
 * continues the same operation on its resource rather than starting an independent one.
 */
function continuesPreviousStep(call: TSESTree.CallExpression): boolean {
  let fn: TSESTree.Node | undefined = call.parent;
  while (
    fn &&
    fn.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    fn.type !== AST_NODE_TYPES.FunctionExpression &&
    fn.type !== AST_NODE_TYPES.FunctionDeclaration
  ) {
    fn = fn.parent;
  }
  if (!fn || fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return false;
  }
  const thenCall = fn.parent;
  const isThenCallback =
    thenCall.type === AST_NODE_TYPES.CallExpression &&
    thenCall.arguments[0] === fn &&
    thenCall.callee.type === AST_NODE_TYPES.MemberExpression &&
    !thenCall.callee.computed &&
    thenCall.callee.property.type === AST_NODE_TYPES.Identifier &&
    thenCall.callee.property.name === 'then';
  if (!isThenCallback || fn.params.length === 0) {
    return false;
  }
  const first = fn.params[0];
  if (first.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const name = first.name;
  return readsName(call.callee, name) || call.arguments.some((arg) => readsName(arg, name));
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-multistep-executor',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow starting multiple async operations in one executor.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxOperations: {
            type: 'integer',
            minimum: 1,
            description: 'Maximum number of operations an executor may start.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ maxOperations: 1 }],
    messages: {
      multipleOperations:
        "This executor starts {{count}} operations, so cancel cannot stop each step on its own. Keep one operation per executor and compose the steps with 'then', a coroutine, or a combinator.",
    },
  },
  defaultOptions: [{ maxOperations: 1 }],
  create(context, [options]) {
    const maxOperations = options.maxOperations ?? 1;

    return {
      NewExpression(node) {
        const shape = analyzeExecutor(node, context);
        if (!shape) {
          return;
        }

        // Settling and context calls are wiring, not operations.
        const settleNames = new Set([paramName(shape.params.resolve), paramName(shape.params.reject)]);
        const wiringCalls = new Set<TSESTree.CallExpression>([
          ...shape.handleCancelCalls.map((call) => call.node),
          ...shape.getSignalCalls,
        ]);
        const starts = [...new Set(shape.operationStarts.map(chainHead))]
          .filter(
            (call) =>
              !wiringCalls.has(call) &&
              !(call.callee.type === AST_NODE_TYPES.Identifier && settleNames.has(call.callee.name)) &&
              !continuesPreviousStep(call),
          )
          .sort((a, b) => a.range[0] - b.range[0]);

        if (starts.length <= maxOperations) {
          return;
        }

        context.report({
          node: starts[maxOperations],
          messageId: 'multipleOperations',
          data: { count: starts.length },
        });
      },
    };
  },
});
