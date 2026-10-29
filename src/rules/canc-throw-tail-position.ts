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
    const executable = following.filter(
      (stmt) => stmt.type !== AST_NODE_TYPES.FunctionDeclaration && stmt.type !== AST_NODE_TYPES.ClassDeclaration,
    );
    return executable.length === 0;
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
    const executable = following.filter(
      (stmt) =>
        stmt.type !== AST_NODE_TYPES.FunctionDeclaration &&
        stmt.type !== AST_NODE_TYPES.ClassDeclaration &&
        stmt.type !== AST_NODE_TYPES.BreakStatement,
    );
    return executable.length === 0;
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
