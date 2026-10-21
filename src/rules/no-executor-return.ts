import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'returnsValue' | 'returnsFunctionNonLazy';

export interface NoExecutorReturnOption {
  allowVoid?: boolean;
}

export type RuleOptions = [NoExecutorReturnOption?];

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

function isFunctionNode(node: TSESTree.Node): node is TSESTree.FunctionLike {
  return FUNCTION_TYPES.has(node.type);
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

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

function findDirectReturnStatements(body: TSESTree.BlockStatement): TSESTree.ReturnStatement[] {
  const returns: TSESTree.ReturnStatement[] = [];
  function visit(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      returns.push(node);
      return;
    }
    if (
      isFunctionNode(node) ||
      node.type === AST_NODE_TYPES.ClassDeclaration ||
      node.type === AST_NODE_TYPES.ClassExpression
    ) {
      return;
    }
    for (const key of Object.keys(node) as (keyof typeof node)[]) {
      if (key === 'parent') {
        continue;
      }
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (isNode(item)) {
            visit(item);
          }
        }
      } else if (isNode(val)) {
        visit(val);
      }
    }
  }
  for (const stmt of body.body) {
    visit(stmt);
  }
  return returns;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-executor-return',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow returning values from CancelablePromise or LazyPromise executors.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowVoid: {
            type: 'boolean',
            description: 'Whether to allow void-returning expressions.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowVoid: false }],
    messages: {
      returnsValue: "The value returned from an executor is ignored. Call 'resolve' with it, or remove the return.",
      returnsFunctionNonLazy:
        "A CancelablePromise executor does not run a returned function on cancel. Register cleanup with 'handleCancel'.",
    },
  },
  defaultOptions: [{ allowVoid: false }],
  create(context, [options]) {
    const allowVoid = options?.allowVoid ?? false;

    return {
      NewExpression(node) {
        const shape = analyzeExecutor(node, context);
        if (!shape) {
          return;
        }

        const body = shape.executor.body;
        if (!body) {
          return;
        }

        if (body.type !== AST_NODE_TYPES.BlockStatement) {
          const unwrapped = unwrapExpression(body);
          if (shape.ctorKind === 'lazy' && isFunctionNode(unwrapped)) {
            return;
          }
          if (allowVoid && unwrapped.type === AST_NODE_TYPES.UnaryExpression && unwrapped.operator === 'void') {
            return;
          }
          if (shape.ctorKind === 'cancelable' && isFunctionNode(unwrapped)) {
            context.report({
              node: body,
              messageId: 'returnsFunctionNonLazy',
            });
            return;
          }
          context.report({
            node: body,
            messageId: 'returnsValue',
          });
          return;
        }

        const returnStatements = findDirectReturnStatements(body);
        for (const ret of returnStatements) {
          if (!ret.argument) {
            continue;
          }
          const expr = ret.argument;
          const unwrapped = unwrapExpression(expr);
          if (allowVoid && unwrapped.type === AST_NODE_TYPES.UnaryExpression && unwrapped.operator === 'void') {
            continue;
          }
          if (isFunctionNode(unwrapped)) {
            if (shape.ctorKind === 'cancelable') {
              context.report({
                node: expr,
                messageId: 'returnsFunctionNonLazy',
              });
            }
            continue;
          }
          context.report({
            node: expr,
            messageId: 'returnsValue',
          });
        }
      },
    };
  },
});
