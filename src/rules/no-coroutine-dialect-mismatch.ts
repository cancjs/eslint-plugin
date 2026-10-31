import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import {
  type FactoryOptions,
  factoryOptionsConstraints,
  factoryOptionsSchema,
  type ResolvedFactories,
  resolveFactories,
} from '../util/coroutine-factories.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'cancAwaitInIter' | 'iterAwaitInCancAsync' | 'forAwaitInIter' | 'iterForAwaitInCancAsync';

export type RuleOptions = [FactoryOptions?];

function unwrap(node: TSESTree.Node): TSESTree.Node {
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

function getHelperMismatch(
  node: TSESTree.Node,
  context: Parameters<Parameters<typeof createRule<RuleOptions, MessageIds>>[0]['create']>[0],
  factories: ResolvedFactories,
): { messageId: MessageIds; helper: string } | null {
  const coroutineCtx = getCoroutineContext(node, context, factories);
  if (!coroutineCtx) {
    return null;
  }

  const unwrapped = unwrap(node);

  // cancAwait or cancAwait.<member>
  if (
    refersTo(unwrapped, context, 'cancAwait') ||
    (unwrapped.type === AST_NODE_TYPES.MemberExpression &&
      !unwrapped.computed &&
      refersTo(unwrapped.object, context, 'cancAwait'))
  ) {
    if (coroutineCtx.kind === 'cancGenAsync') {
      return { messageId: 'cancAwaitInIter', helper: context.sourceCode.getText(unwrapped) };
    }
  }

  // cancGenAwait or cancGenAwait.<member>
  if (
    refersTo(unwrapped, context, 'cancGenAwait') ||
    (unwrapped.type === AST_NODE_TYPES.MemberExpression &&
      !unwrapped.computed &&
      refersTo(unwrapped.object, context, 'cancGenAwait'))
  ) {
    if (coroutineCtx.kind === 'cancAsync') {
      return { messageId: 'iterAwaitInCancAsync', helper: context.sourceCode.getText(unwrapped) };
    }
  }

  // cancForAwait or cancForAwait.<member>
  if (
    refersTo(unwrapped, context, 'cancForAwait') ||
    (unwrapped.type === AST_NODE_TYPES.MemberExpression &&
      !unwrapped.computed &&
      refersTo(unwrapped.object, context, 'cancForAwait'))
  ) {
    if (coroutineCtx.kind === 'cancGenAsync') {
      return { messageId: 'forAwaitInIter', helper: context.sourceCode.getText(unwrapped) };
    }
  }

  // cancGenForAwait or cancGenForAwait.<member>
  if (
    refersTo(unwrapped, context, 'cancGenForAwait') ||
    (unwrapped.type === AST_NODE_TYPES.MemberExpression &&
      !unwrapped.computed &&
      refersTo(unwrapped.object, context, 'cancGenForAwait'))
  ) {
    if (coroutineCtx.kind === 'cancAsync') {
      return { messageId: 'iterForAwaitInCancAsync', helper: context.sourceCode.getText(unwrapped) };
    }
  }

  // cancGenDelegate or cancGenDelegate.<member>
  if (
    refersTo(unwrapped, context, 'cancGenDelegate') ||
    (unwrapped.type === AST_NODE_TYPES.MemberExpression &&
      !unwrapped.computed &&
      refersTo(unwrapped.object, context, 'cancGenDelegate'))
  ) {
    if (coroutineCtx.kind === 'cancAsync') {
      return { messageId: 'iterForAwaitInCancAsync', helper: context.sourceCode.getText(unwrapped) };
    }
  }

  return null;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-coroutine-dialect-mismatch',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mixing coroutine helper dialects inside coroutine bodies.',
    },
    schema: [
      {
        type: 'object',
        properties: factoryOptionsSchema,
        allOf: factoryOptionsConstraints,
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      cancAwaitInIter:
        "'{{helper}}' inside a cancGenAsync body emits the inner promise to the consumer instead of awaiting it. Use 'cancGenAwait'.",
      iterAwaitInCancAsync:
        "'{{helper}}' inside a cancAsync body resolves to a marker object instead of the awaited value. Use 'cancAwait'.",
      forAwaitInIter:
        "'{{helper}}' inside a cancGenAsync body yields bare values that the generator driver reads as emits. Use 'cancGenForAwait' or 'cancGenDelegate'.",
      iterForAwaitInCancAsync:
        "'{{helper}}' inside a cancAsync body yields markers that the cancAsync driver cannot read. Use 'cancForAwait'.",
    },
  },
  defaultOptions: [{}],
  create(context) {
    const factories = resolveFactories(context.options[0]);

    return {
      CallExpression(node) {
        const mismatch = getHelperMismatch(node.callee, context, factories);
        if (mismatch) {
          context.report({
            node,
            messageId: mismatch.messageId,
            data: { helper: mismatch.helper },
          });
        }
      },

      YieldExpression(node) {
        if (!node.argument) {
          return;
        }
        const unwrapped = unwrap(node.argument);
        if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
          // Already handled by CallExpression visitor
          return;
        }

        const mismatch = getHelperMismatch(unwrapped, context, factories);
        if (mismatch) {
          context.report({
            node: unwrapped,
            messageId: mismatch.messageId,
            data: { helper: mismatch.helper },
          });
        }
      },
    };
  },
});
