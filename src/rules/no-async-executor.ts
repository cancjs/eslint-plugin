import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isCancCtorIdent, isLazyCtorIdent } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'asyncExecutor' | 'asyncDriver';
export type RuleOptions = [];

function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
  let curr = node;
  while (
    curr.type === AST_NODE_TYPES.TSAsExpression ||
    curr.type === AST_NODE_TYPES.TSTypeAssertion ||
    curr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    curr = curr.expression;
  }
  return curr;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-async-executor',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow async functions as executor in CancelablePromise or LazyPromise.',
    },
    schema: [],
    messages: {
      asyncExecutor:
        "An async executor loses thrown errors and keeps running after cancel. Use a synchronous executor and forward the outcome with 'then(resolve, reject)'.",
      asyncDriver:
        "This executor starts an async function that keeps running after cancel and swallows its errors. Start the operation directly and forward the outcome with 'then(resolve, reject)'.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      NewExpression(node) {
        const isTracked = isCancCtorIdent(node.callee, context) || isLazyCtorIdent(node.callee, context);
        if (!isTracked) {
          return;
        }

        if (node.arguments.length > 0 && node.arguments[0].type === AST_NODE_TYPES.Identifier) {
          const arg = node.arguments[0];
          let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
          let variable: TSESLint.Scope.Variable | undefined;
          while (scope) {
            variable = scope.variables.find((v) => v.name === arg.name);
            if (variable) {
              break;
            }
            scope = scope.upper;
          }

          if (variable) {
            for (const def of variable.defs) {
              if (def.node.type === AST_NODE_TYPES.FunctionDeclaration && def.node.async) {
                context.report({
                  node: arg,
                  messageId: 'asyncExecutor',
                });
                return;
              }
              if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
                const init = unwrapExpression(def.node.init);
                if (
                  (init.type === AST_NODE_TYPES.FunctionExpression ||
                    init.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
                  init.async
                ) {
                  context.report({
                    node: arg,
                    messageId: 'asyncExecutor',
                  });
                  return;
                }
              }
            }

            for (const ref of variable.references) {
              if (ref.isWrite() && ref.writeExpr) {
                const writeExpr = unwrapExpression(ref.writeExpr);
                if (
                  (writeExpr.type === AST_NODE_TYPES.FunctionExpression ||
                    writeExpr.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
                  writeExpr.async
                ) {
                  context.report({
                    node: arg,
                    messageId: 'asyncExecutor',
                  });
                  return;
                }
              }
            }
          }

          return;
        }

        const shape = analyzeExecutor(node, context);
        if (!shape) {
          return;
        }

        if (shape.isAsync) {
          context.report({
            node: shape.executor,
            messageId: 'asyncExecutor',
          });
        }

        if (shape.asyncDriverInside) {
          for (const call of shape.asyncDriverCalls) {
            context.report({
              node: call,
              messageId: 'asyncDriver',
            });
          }
        }
      },
    };
  },
});
