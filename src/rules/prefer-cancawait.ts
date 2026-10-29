import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancBindings, getCoroutineContext, refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export interface Options {
  allowBareYield?: boolean;
}

export type MessageIds = 'preferCancAwait';
export type RuleOptions = [Options?];

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

function isTrackedCancAwaitCall(
  expr: TSESTree.Node,
  context: Parameters<Parameters<typeof createRule<RuleOptions, MessageIds>>[0]['create']>[0],
): boolean {
  const unwrapped = unwrapParens(expr);
  if (unwrapped.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped.callee;
  if (refersTo(callee, context, 'cancAwait')) {
    return true;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    COMBINATOR_MEMBERS.has(callee.property.name)
  ) {
    if (refersTo(callee.object, context, 'cancAwait')) {
      return true;
    }
  }
  return false;
}

function findCancAwaitLocalName(
  context: Parameters<Parameters<typeof createRule<RuleOptions, MessageIds>>[0]['create']>[0],
): string | null {
  const bindings = getCancBindings(context);
  for (const [localName, binding] of bindings) {
    if (
      !binding.namespace &&
      binding.source === '@cancjs/coroutine' &&
      (binding.exported === 'cancAwait' || binding.exported === 'await')
    ) {
      return localName;
    }
  }
  return null;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-cancawait',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer yield* cancAwait(...) over bare yield inside cancAsync coroutines.',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowBareYield: {
            type: 'boolean',
            description: 'Whether to allow bare yields without reporting.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowBareYield: false }],
    messages: {
      preferCancAwait:
        "A bare 'yield' types every step as 'unknown' and drops the declared failure type. Write 'yield* cancAwait(...)'.",
    },
  },
  defaultOptions: [{ allowBareYield: false }],
  create(context) {
    const allowBareYield = context.options[0]?.allowBareYield ?? false;

    return {
      YieldExpression(node) {
        if (node.delegate || !node.argument || allowBareYield) {
          return;
        }

        const coroutineCtx = getCoroutineContext(node, context);
        if (!coroutineCtx || coroutineCtx.kind !== 'cancAsync') {
          return;
        }

        if (isTrackedCancAwaitCall(node.argument, context)) {
          return;
        }

        const localCancAwait = findCancAwaitLocalName(context);

        context.report({
          node,
          messageId: 'preferCancAwait',
          fix(fixer) {
            if (!localCancAwait) {
              return null;
            }
            const argText = context.sourceCode.getText(node.argument!);
            return fixer.replaceText(node, `yield* ${localCancAwait}(${argText})`);
          },
        });
      },
    };
  },
});
