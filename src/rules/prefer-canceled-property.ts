import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { hasTypeServices, isCancelableExpression, isCancelablePattern } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { getCancSettings } from '../util/settings.js';

export type MessageIds = 'preferCanceledProperty' | 'suggestCanceledKey';
export type RuleOptions = [];

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-canceled-property',
  meta: {
    type: 'suggestion',
    docs: {
      description: "Prefer 'canceled' over deprecated 'isCanceled' property on cancelables.",
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      preferCanceledProperty: "'isCanceled' is deprecated. Use 'canceled'.",
      suggestCanceledKey: "Use 'canceled' property instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!hasTypeServices(context)) {
      return {};
    }

    const settings = getCancSettings(context);

    function isCancelableTarget(node: TSESTree.Node): boolean {
      return isCancelableExpression(node as TSESTree.Expression, context, settings);
    }

    return {
      MemberExpression(node) {
        let isMatch = false;
        let isComputedString = false;
        let quoteChar = "'";

        if (!node.computed && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'isCanceled') {
          isMatch = true;
        } else if (
          node.computed &&
          node.property.type === AST_NODE_TYPES.Literal &&
          node.property.value === 'isCanceled'
        ) {
          isMatch = true;
          isComputedString = true;
          const raw = node.property.raw;
          quoteChar = typeof raw === 'string' && raw.startsWith('"') ? '"' : "'";
        }

        if (!isMatch) {
          return;
        }

        // Do not flag assignment targets (writes)
        if (node.parent.type === AST_NODE_TYPES.AssignmentExpression && node.parent.left === node) {
          return;
        }
        if (node.parent.type === AST_NODE_TYPES.UpdateExpression && node.parent.argument === node) {
          return;
        }

        if (!isCancelableTarget(node.object)) {
          return;
        }

        context.report({
          node: node.property,
          messageId: 'preferCanceledProperty',
          fix(fixer) {
            if (isComputedString) {
              return fixer.replaceText(node.property, `${quoteChar}canceled${quoteChar}`);
            }
            return fixer.replaceText(node.property, 'canceled');
          },
        });
      },

      Property(node) {
        if (node.parent.type !== AST_NODE_TYPES.ObjectPattern) {
          return;
        }

        let isMatch = false;
        if (!node.computed && node.key.type === AST_NODE_TYPES.Identifier && node.key.name === 'isCanceled') {
          isMatch = true;
        } else if (node.computed && node.key.type === AST_NODE_TYPES.Literal && node.key.value === 'isCanceled') {
          isMatch = true;
        }

        if (!isMatch) {
          return;
        }

        // Determine if receiver is cancelable
        const pattern = node.parent;
        let cancelable: boolean;

        if (pattern.parent.type === AST_NODE_TYPES.VariableDeclarator && pattern.parent.init) {
          cancelable = isCancelableTarget(pattern.parent.init);
        } else if (pattern.parent.type === AST_NODE_TYPES.AssignmentExpression && pattern.parent.left === pattern) {
          cancelable = isCancelableTarget(pattern.parent.right);
        } else {
          // Check type of pattern directly (e.g. parameter destructuring)
          cancelable = isCancelablePattern(pattern, context);
        }

        if (!cancelable) {
          return;
        }

        // Destructuring receives suggestion only (never autofix)
        context.report({
          node: node.key,
          messageId: 'preferCanceledProperty',
          suggest: [
            {
              messageId: 'suggestCanceledKey',
              fix(fixer) {
                if (node.shorthand) {
                  return fixer.replaceText(node, 'canceled: isCanceled');
                }
                return fixer.replaceText(node.key, 'canceled');
              },
            },
          ],
        });
      },
    };
  },
});
