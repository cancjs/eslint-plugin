import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { isPublicSubpath, parseCancSubpath } from '../util/public-subpaths.js';

export type MessageIds = 'internalImport' | 'suggestRootImport';
export type RuleOptions = [];

const CAN_AUTOFIX_RE = /^@cancjs\/[^/]+\/(dist|src|lib|build)\//;

export default createRule<RuleOptions, MessageIds>({
  name: 'no-internal-imports',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow imports from non-public internal package subpaths in @cancjs.',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      internalImport:
        "'{{source}}' is not a public entry point, so it can change without notice and can load a second copy of the library. Import from '{{root}}'.",
      suggestRootImport: "Import from '{{root}}'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const rawSettings = context.settings.canc as { sources?: string[] } | undefined;
    const userConfiguredSources = rawSettings?.sources ?? [];

    function checkSourceLiteral(sourceNode: TSESTree.StringLiteral | null | undefined): void {
      if (!sourceNode || typeof sourceNode.value !== 'string') {
        return;
      }

      const sourceValue = sourceNode.value;
      const parsed = parseCancSubpath(sourceValue);
      if (!parsed) {
        return;
      }

      if (isPublicSubpath(sourceValue, userConfiguredSources)) {
        return;
      }

      const quote = sourceNode.raw ? sourceNode.raw[0] : "'";
      const rootReplacement = `${quote}${parsed.root}${quote}`;
      const canAutofix = CAN_AUTOFIX_RE.test(sourceValue);

      if (canAutofix) {
        context.report({
          node: sourceNode,
          messageId: 'internalImport',
          data: {
            source: sourceValue,
            root: parsed.root,
          },
          fix(fixer) {
            return fixer.replaceText(sourceNode, rootReplacement);
          },
        });
      } else {
        context.report({
          node: sourceNode,
          messageId: 'internalImport',
          data: {
            source: sourceValue,
            root: parsed.root,
          },
          suggest: [
            {
              messageId: 'suggestRootImport',
              data: {
                root: parsed.root,
              },
              fix(fixer) {
                return fixer.replaceText(sourceNode, rootReplacement);
              },
            },
          ],
        });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSourceLiteral(node.source);
      },

      ExportNamedDeclaration(node) {
        if (node.source?.type === AST_NODE_TYPES.Literal) {
          checkSourceLiteral(node.source);
        }
      },

      ExportAllDeclaration(node) {
        checkSourceLiteral(node.source);
      },

      ImportExpression(node) {
        if (node.source.type === AST_NODE_TYPES.Literal) {
          checkSourceLiteral(node.source as TSESTree.StringLiteral);
        }
      },

      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'require' &&
          node.arguments.length === 1
        ) {
          const arg = node.arguments[0];
          if (arg?.type === AST_NODE_TYPES.Literal) {
            checkSourceLiteral(arg as TSESTree.StringLiteral);
          }
        }
      },
    };
  },
});
