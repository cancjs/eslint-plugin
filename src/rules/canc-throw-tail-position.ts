import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isThrowHelperCall } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'cancThrowTailPosition';
export type RuleOptions = [];

function isInsideLoop(node: TSESTree.Node): boolean {
  let curr: TSESTree.Node | undefined = node.parent;
  while (curr) {
    if (
      curr.type === AST_NODE_TYPES.FunctionDeclaration ||
      curr.type === AST_NODE_TYPES.FunctionExpression ||
      curr.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      break;
    }
    if (
      curr.type === AST_NODE_TYPES.ForStatement ||
      curr.type === AST_NODE_TYPES.ForInStatement ||
      curr.type === AST_NODE_TYPES.ForOfStatement ||
      curr.type === AST_NODE_TYPES.WhileStatement ||
      curr.type === AST_NODE_TYPES.DoWhileStatement
    ) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function containsLabeledStatement(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.LabeledStatement) {
    return true;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            if (containsLabeledStatement(item as TSESTree.Node)) return true;
          }
        }
      } else if ('type' in child) {
        if (containsLabeledStatement(child as TSESTree.Node)) return true;
      }
    }
  }
  return false;
}

function canAutofix(node: TSESTree.ExpressionStatement): boolean {
  if (isInsideLoop(node)) {
    return false;
  }
  const parent = node.parent;
  if (parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.Program) {
    const list = parent.body;
    const idx = list.indexOf(node);
    if (idx === -1) {
      return false;
    }
    const following = list.slice(idx + 1);
    return !following.some(containsLabeledStatement);
  }
  if (parent.type === AST_NODE_TYPES.IfStatement) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.SwitchCase) {
    const list = parent.consequent;
    const idx = list.indexOf(node);
    if (idx === -1) {
      return false;
    }
    const following = list.slice(idx + 1);
    return !following.some(containsLabeledStatement);
  }
  return false;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'canc-throw-tail-position',
  meta: {
    type: 'problem',
    docs: {
      description: "Require 'return yield* canc.throw(...)' in tail position so following code is unreachable.",
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      cancThrowTailPosition:
        "'yield* {{thrower}}(...)' does not end the function for the compiler. Write 'return yield* {{thrower}}(...)' so the code after it is unreachable.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ExpressionStatement(node) {
        if (node.expression.type !== AST_NODE_TYPES.YieldExpression || !node.expression.delegate) {
          return;
        }

        const yieldArg = node.expression.argument;
        if (yieldArg.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }

        const throwCall = isThrowHelperCall(yieldArg, context);
        if (!throwCall) {
          return;
        }

        const thrower = context.sourceCode.getText(yieldArg.callee);
        const fixable = canAutofix(node);

        if (fixable) {
          context.report({
            node,
            messageId: 'cancThrowTailPosition',
            data: { thrower },
            fix(fixer) {
              return fixer.insertTextBefore(node, 'return ');
            },
          });
        } else {
          context.report({
            node,
            messageId: 'cancThrowTailPosition',
            data: { thrower },
            suggest: [
              {
                messageId: 'cancThrowTailPosition',
                data: { thrower },
                fix(fixer) {
                  return fixer.insertTextBefore(node, 'return ');
                },
              },
            ],
          });
        }
      },
    };
  },
});
