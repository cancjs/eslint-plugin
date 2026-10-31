import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import {
  checkCombinatorGapElements,
  getCancServices,
  inlineCallbackReturnsPlainPromise,
  isCancelableOrLazyExpression,
  isPlainPromiseSinkExpression,
} from '../util/canc-types.js';
import {
  type FactoryOptions,
  factoryOptionsConstraints,
  factoryOptionsSchema,
  resolveFactories,
} from '../util/coroutine-factories.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'gapStep' | 'gapChainStep';
export type RuleOptions = [FactoryOptions?];

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

export default createRule<RuleOptions, MessageIds>({
  name: 'no-cancellation-gap',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow non-cancelable promise steps inside cancelable flows and chains.',
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
      gapStep:
        "This step awaits a promise that cannot be canceled. After a cancel its result is discarded but the work keeps running. Make the operation cancelable at its source (for example with 'cancelify' or 'promisify'), or acknowledge the gap with a disable comment.",
      gapChainStep:
        'This callback returns a plain promise into a cancelable chain, so the work it starts keeps running after a cancel. Return a cancelable promise instead.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const factories = resolveFactories(context.options[0]);

    const services = getCancServices(context);
    if (!services) {
      return {};
    }

    return {
      CallExpression(node) {
        // 1. Check combinator or step call inside coroutine
        const coroutineCtx = getCoroutineContext(node, context, factories);
        if (coroutineCtx) {
          const target = coroutineCtx.kind === 'cancGenAsync' ? 'cancGenAwait' : 'cancAwait';
          const callee = node.callee;

          // Check combinator calls: cancAwait.all([...]), etc.
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            COMBINATOR_MEMBERS.has(callee.property.name) &&
            refersTo(callee.object, context, target)
          ) {
            const arg0 = node.arguments[0];
            if (arg0) {
              const gapNodes = checkCombinatorGapElements(arg0, context);
              for (const gapNode of gapNodes) {
                context.report({
                  node: gapNode,
                  messageId: 'gapStep',
                });
              }
            }
            return;
          }

          // Check direct cancAwait(...) call
          if (refersTo(callee, context, target)) {
            const operand = node.arguments[0];
            if (operand && isPlainPromiseSinkExpression(operand, context)) {
              context.report({
                node: operand,
                messageId: 'gapStep',
              });
            }
            return;
          }
        }

        // 2. Check cancelable chain callback returns: p.then(cb), p.catch(cb), p.finally(cb)
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          ['then', 'catch', 'finally'].includes(callee.property.name)
        ) {
          const isCanc = isCancelableOrLazyExpression(callee.object, context);
          if (isCanc) {
            const methodName = callee.property.name;
            const cbArgs = methodName === 'then' ? [node.arguments[0], node.arguments[1]] : [node.arguments[0]];

            for (const arg of cbArgs) {
              if (!arg) continue;
              const unwrapped = unwrapParens(arg);
              if (inlineCallbackReturnsPlainPromise(unwrapped, context)) {
                context.report({
                  node: unwrapped,
                  messageId: 'gapChainStep',
                });
              }
            }
          }
        }
      },

      YieldExpression(node) {
        if (!node.argument || node.delegate) {
          return;
        }

        const unwrapped = unwrapParens(node.argument);
        const coroutineCtx = getCoroutineContext(node, context, factories);
        if (coroutineCtx?.kind === 'cancAsync') {
          // If it's a tracked cancAwait call, CallExpression visitor handles it
          if (
            unwrapped.type === AST_NODE_TYPES.CallExpression &&
            (refersTo(unwrapped.callee, context, 'cancAwait') ||
              (unwrapped.callee.type === AST_NODE_TYPES.MemberExpression &&
                !unwrapped.callee.computed &&
                refersTo(unwrapped.callee.object, context, 'cancAwait')))
          ) {
            return;
          }

          if (isPlainPromiseSinkExpression(unwrapped, context)) {
            context.report({
              node: unwrapped,
              messageId: 'gapStep',
            });
          }
        }
      },
    };
  },
});
