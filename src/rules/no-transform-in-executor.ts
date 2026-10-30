import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'transformBeforeResolve' | 'moveTransformToThen';
export type RuleOptions = [{ allowPropertyAccess?: boolean }];

function within(inner: TSESTree.Node, outer: TSESTree.Node): boolean {
  return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

function isFunction(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression;
}

function isPropertyPick(node: TSESTree.Node): boolean {
  let curr: TSESTree.Node = node;
  while (curr.type === AST_NODE_TYPES.MemberExpression && !curr.computed) {
    curr = curr.object;
  }
  return curr !== node && (curr.type === AST_NODE_TYPES.Identifier || curr.type === AST_NODE_TYPES.ThisExpression);
}

/** Raw values and started operations pass through; anything computed from a value is a transform. */
function isTransform(arg: TSESTree.CallExpressionArgument, allowPropertyAccess: boolean): boolean {
  switch (arg.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.ThisExpression:
      return false;
    case AST_NODE_TYPES.TemplateLiteral:
      return arg.expressions.length > 0;
    case AST_NODE_TYPES.CallExpression:
      // resolve(op()) hands over an operation, it does not reshape a result
      return arg.callee.type !== AST_NODE_TYPES.Identifier;
    case AST_NODE_TYPES.MemberExpression:
      return !(allowPropertyAccess && isPropertyPick(arg));
    default:
      return true;
  }
}

/** The single-parameter `.then` onFulfilled callback enclosing `node`, if `node` sits inside one. */
function enclosingThenCallback(
  node: TSESTree.Node,
  executor: TSESTree.Node,
): { callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression; param: TSESTree.Identifier } | null {
  let curr: TSESTree.Node | undefined = node.parent;
  while (curr && curr !== executor) {
    if (isFunction(curr)) {
      const call = curr.parent;
      const isThenOnFulfilled =
        call.type === AST_NODE_TYPES.CallExpression &&
        call.arguments[0] === curr &&
        call.callee.type === AST_NODE_TYPES.MemberExpression &&
        !call.callee.computed &&
        call.callee.property.type === AST_NODE_TYPES.Identifier &&
        call.callee.property.name === 'then';
      if (isThenOnFulfilled && curr.params.length === 1 && curr.params[0].type === AST_NODE_TYPES.Identifier) {
        return { callback: curr, param: curr.params[0] };
      }
      return null;
    }
    curr = curr.parent;
  }
  return null;
}

/**
 * True when every name in `arg` is the callback parameter, bound inside `arg`, or bound outside the
 * executor: the expression still means the same thing once moved after the `new` expression.
 */
function dependsOnlyOn(
  arg: TSESTree.Node,
  paramVar: TSESLint.Scope.Variable,
  executor: TSESTree.Node,
  scope: TSESLint.Scope.Scope,
): boolean {
  let usesParam = false;
  const pending: TSESLint.Scope.Scope[] = [scope];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const ref of current.references) {
      if (!within(ref.identifier, arg)) {
        continue;
      }
      const variable = ref.resolved;
      if (variable === paramVar) {
        usesParam = true;
        continue;
      }
      if (!variable || variable.defs.length === 0) {
        continue;
      }
      const defNode = variable.defs[0].name;
      if (within(defNode, arg) || !within(defNode, executor)) {
        continue;
      }
      return false;
    }
    pending.push(...current.childScopes);
  }
  return usesParam;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-transform-in-executor',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow transforming data before resolving in executor.',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowPropertyAccess: {
            type: 'boolean',
            description: 'Whether resolving with a plain property access is allowed.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowPropertyAccess: false }],
    messages: {
      transformBeforeResolve:
        "The result is transformed before 'resolve', inside the executor. Resolve with the raw result and transform it in a 'then' after the promise.",
      moveTransformToThen: "Resolve with the raw result and move the transform to a 'then' after the promise.",
    },
  },
  defaultOptions: [{ allowPropertyAccess: false }],
  create(context, [options]) {
    const allowPropertyAccess = options.allowPropertyAccess ?? false;
    const sourceCode = context.sourceCode;

    return {
      NewExpression(node) {
        const shape = analyzeExecutor(node, context);
        if (!shape?.transformsBeforeResolve) {
          return;
        }
        const resolveParam = shape.params.resolve;
        if (resolveParam?.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        const resolveVar = sourceCode
          .getDeclaredVariables(shape.executor)
          .find((variable) => variable.name === resolveParam.name);
        if (!resolveVar) {
          return;
        }

        const cleanupArgs = shape.handleCancelCalls.flatMap((call) => call.node.arguments);
        const resolveCalls = resolveVar.references
          .map((ref) => ref.identifier.parent)
          .filter(
            (parent): parent is TSESTree.CallExpression =>
              parent.type === AST_NODE_TYPES.CallExpression &&
              parent.callee.type === AST_NODE_TYPES.Identifier &&
              parent.callee.name === resolveParam.name,
          );

        const typed = Boolean(node.typeArguments);
        const isChainObject = node.parent.type === AST_NODE_TYPES.MemberExpression && node.parent.object === node;

        for (const call of resolveCalls) {
          if (cleanupArgs.some((cleanup) => within(call, cleanup))) {
            continue;
          }
          if (call.arguments.length === 0) {
            continue;
          }
          const arg = call.arguments[0];
          if (!isTransform(arg, allowPropertyAccess)) {
            continue;
          }

          let suggest: TSESLint.ReportSuggestionArray<MessageIds> = [];
          const thenCallback =
            resolveCalls.length === 1 && !typed && !isChainObject ? enclosingThenCallback(call, shape.executor) : null;
          if (thenCallback) {
            const callbackScope = sourceCode.getScope(thenCallback.callback);
            const paramVar = callbackScope.set.get(thenCallback.param.name);
            if (paramVar && dependsOnlyOn(arg, paramVar, shape.executor, callbackScope)) {
              const name = thenCallback.param.name;
              const argText = sourceCode.getText(arg);
              suggest = [
                {
                  messageId: 'moveTransformToThen',
                  fix: (fixer) => [
                    fixer.replaceText(arg, name),
                    fixer.insertTextAfter(node, `.then((${name}) => ${argText})`),
                  ],
                },
              ];
            }
          }

          context.report({
            node: arg,
            messageId: 'transformBeforeResolve',
            suggest,
          });
        }
      },
    };
  },
});
