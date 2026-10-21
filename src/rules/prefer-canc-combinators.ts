import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancBindings } from '../util/canc-imports.js';
import { getCancServices, hasCancelableElements } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { getCancSettings } from '../util/settings.js';

type MessageIds = 'preferCancCombinator' | 'suggestUseCancelablePromise';

const COMBINATOR_METHODS = new Set(['all', 'race', 'any', 'allSettled']);

export default createRule<[], MessageIds>({
  name: 'prefer-canc-combinators',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer CancelablePromise combinators over native Promise combinators when inputs are cancelable',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      preferCancCombinator:
        "'Promise.{{method}}' does not cancel the other inputs when the result settles and cannot be cancelled itself, so the work keeps running. Use 'CancelablePromise.{{method}}'.",
      suggestUseCancelablePromise:
        "Use 'CancelablePromise.{{method}}' (import 'CancelablePromise' from '@cancjs/promise').",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = getCancServices(context);
    if (!services?.program) {
      return {};
    }

    const settings = getCancSettings(context);

    function isPromiseShadowed(node: TSESTree.Identifier): boolean {
      let scope: TSESLint.Scope.Scope = context.sourceCode.getScope(node);
      while (scope.upper) {
        const v = scope.variables.find((variable) => variable.name === 'Promise');
        if (v && v.defs.length > 0) {
          return true;
        }
        scope = scope.upper;
      }
      return false;
    }

    function getTrackedCancelablePromiseName(): string | null {
      const bindings = getCancBindings(context);
      for (const [name, binding] of bindings.entries()) {
        if (
          !binding.namespace &&
          (binding.exported === 'CancelablePromise' ||
            (binding.exported === 'default' && binding.source === '@cancjs/promise'))
        ) {
          return name;
        }
      }
      return null;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
          return;
        }
        const member = node.callee;
        if (
          member.object.type !== AST_NODE_TYPES.Identifier ||
          member.object.name !== 'Promise' ||
          member.property.type !== AST_NODE_TYPES.Identifier ||
          !COMBINATOR_METHODS.has(member.property.name)
        ) {
          return;
        }

        if (isPromiseShadowed(member.object)) {
          return;
        }

        const method = member.property.name;
        if (node.arguments.length === 0) {
          return;
        }
        const argNode = node.arguments[0];

        if (!hasCancelableElements(argNode, context, settings)) {
          return;
        }

        const trackedName = getTrackedCancelablePromiseName();

        if (trackedName) {
          context.report({
            node: member,
            messageId: 'preferCancCombinator',
            data: { method },
            fix(fixer) {
              return fixer.replaceText(member.object, trackedName);
            },
          });
        } else {
          context.report({
            node: member,
            messageId: 'preferCancCombinator',
            data: { method },
            suggest: [
              {
                messageId: 'suggestUseCancelablePromise',
                data: { method },
                fix(fixer) {
                  return fixer.replaceText(member.object, 'CancelablePromise');
                },
              },
            ],
          });
        }
      },
    };
  },
});
