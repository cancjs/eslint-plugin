import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { hasTypeServices, isThenableExpression } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { analyzeExecutor, unwrapTypeOnly } from '../util/executor.js';

export type MessageIds = 'multipleOperations';
export type RuleOptions = [{ maxOperations?: number }];
type Context = TSESLint.RuleContext<MessageIds, RuleOptions>;

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

/** Every name a parameter binds, through object, array, rest and default patterns. */
function patternNames(node: TSESTree.Node | null | undefined): string[] {
  switch (node?.type) {
    case AST_NODE_TYPES.Identifier:
      return [node.name];
    case AST_NODE_TYPES.AssignmentPattern:
      return patternNames(node.left);
    case AST_NODE_TYPES.RestElement:
      return patternNames(node.argument);
    case AST_NODE_TYPES.ArrayPattern:
      return node.elements.flatMap(patternNames);
    case AST_NODE_TYPES.ObjectPattern:
      return node.properties.flatMap((prop) =>
        prop.type === AST_NODE_TYPES.RestElement ? patternNames(prop.argument) : patternNames(prop.value),
      );
    default:
      return [];
  }
}

/**
 * A step that consumes the value the previous step produced (`open().then((stream) => readAll(stream))`)
 * continues the same operation on its resource rather than starting an independent one.
 */
function continuesPreviousStep(call: TSESTree.CallExpression, context: Context): boolean {
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
  if (!thenCall || thenCall.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const isThenCallback =
    thenCall.arguments[0] === fn &&
    thenCall.callee.type === AST_NODE_TYPES.MemberExpression &&
    !thenCall.callee.computed &&
    thenCall.callee.property.type === AST_NODE_TYPES.Identifier &&
    thenCall.callee.property.name === 'then';
  if (!isThenCallback || fn.params.length === 0) {
    return false;
  }

  const names = new Set(patternNames(fn.params[0]));
  const declaredVars = context.sourceCode.getDeclaredVariables(fn);
  const paramVars = declaredVars.filter((v) => names.has(v.name));

  const [callStart, callEnd] = call.range;
  return paramVars.some((v) =>
    v.references.some((ref) => {
      const [refStart, refEnd] = ref.identifier.range;
      return refStart >= callStart && refEnd <= callEnd;
    }),
  );
}

function isResolveFirstArgument(call: TSESTree.CallExpression, resolveName: string | undefined): boolean {
  if (!resolveName) {
    return false;
  }
  let curr: TSESTree.Node = call;
  while (curr.parent) {
    const parent = curr.parent;
    if (
      parent.type === AST_NODE_TYPES.TSAsExpression ||
      parent.type === AST_NODE_TYPES.TSTypeAssertion ||
      parent.type === AST_NODE_TYPES.TSNonNullExpression ||
      parent.type === AST_NODE_TYPES.TSInstantiationExpression
    ) {
      curr = parent;
      continue;
    }
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.length > 0 &&
      unwrapTypeOnly(parent.arguments[0]) === call &&
      parent.callee.type === AST_NODE_TYPES.Identifier &&
      parent.callee.name === resolveName
    ) {
      return true;
    }
    break;
  }
  return false;
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
        const resolveName = paramName(shape.params.resolve);
        const starts = [...new Set(shape.operationStarts.map(chainHead))]
          .filter(
            (call) =>
              !wiringCalls.has(call) &&
              !(call.callee.type === AST_NODE_TYPES.Identifier && settleNames.has(call.callee.name)) &&
              !continuesPreviousStep(call, context) &&
              !(
                isResolveFirstArgument(call, resolveName) &&
                hasTypeServices(context) &&
                !isThenableExpression(call, context)
              ),
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
