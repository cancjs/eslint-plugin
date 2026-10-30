import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'missingStar' | 'unusedCancAwait';
export type RuleOptions = [];

const COMBINATOR_MEMBERS = new Set(['all', 'race', 'any', 'allSettled']);

function unwrapParens(node: TSESTree.Node): TSESTree.Node {
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

function getTrackedAwaitCall(
  expr: TSESTree.Node,
  context: Parameters<Parameters<typeof createRule<RuleOptions, MessageIds>>[0]['create']>[0],
  dialect: 'cancAsync' | 'cancGenAsync',
): { call: TSESTree.CallExpression; awaitText: string } | null {
  const unwrapped = unwrapParens(expr);
  if (unwrapped.type !== AST_NODE_TYPES.CallExpression) {
    return null;
  }
  const callee = unwrapped.callee;
  const target = dialect === 'cancGenAsync' ? 'cancGenAwait' : 'cancAwait';

  if (refersTo(callee, context, target)) {
    return { call: unwrapped, awaitText: context.sourceCode.getText(callee) };
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    COMBINATOR_MEMBERS.has(callee.property.name)
  ) {
    if (refersTo(callee.object, context, target)) {
      return { call: unwrapped, awaitText: context.sourceCode.getText(callee) };
    }
  }

  return null;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-unstarred-cancawait',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require yield* on cancAwait calls and disallow unused statement-position cancAwait calls.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingStar:
        "'yield {{await}}(...)' passes the generator object to the driver, so the inner promise is never awaited and cancellation is never wired. Write 'yield* {{await}}(...)'.",
      unusedCancAwait:
        "'{{await}}(...)' only creates a generator. Without 'yield*' the step never runs. Write 'yield* {{await}}(...)'.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      YieldExpression(node) {
        if (node.delegate || !node.argument) {
          return;
        }

        const coroutineCtx = getCoroutineContext(node, context);
        if (!coroutineCtx) {
          return;
        }

        const awaitInfo = getTrackedAwaitCall(node.argument, context, coroutineCtx.kind);
        if (awaitInfo) {
          context.report({
            node,
            messageId: 'missingStar',
            data: { await: awaitInfo.awaitText },
            fix(fixer) {
              const yieldToken = context.sourceCode.getFirstToken(node);
              if (yieldToken && yieldToken.value === 'yield') {
                return fixer.insertTextAfter(yieldToken, '*');
              }
              return null;
            },
          });
        }
      },

      ExpressionStatement(node) {
        const coroutineCtx = getCoroutineContext(node, context);
        if (!coroutineCtx) {
          return;
        }

        const awaitInfo = getTrackedAwaitCall(node.expression, context, coroutineCtx.kind);
        if (awaitInfo) {
          context.report({
            node: node.expression,
            messageId: 'unusedCancAwait',
            data: { await: awaitInfo.awaitText },
          });
        }
      },
    };
  },
});
