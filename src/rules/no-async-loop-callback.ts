import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'asyncLoopCallback' | 'convertToGenerator' | 'removeAsync';
export type RuleOptions = [];

function unwrapCallback(node: TSESTree.Node): TSESTree.Node {
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

function hasAwait(node: TSESTree.Node): boolean {
  let found = false;

  function walk(current: TSESTree.Node): void {
    if (found) return;
    if (
      current !== node &&
      (current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.FunctionDeclaration)
    ) {
      return;
    }
    if (current.type === AST_NODE_TYPES.AwaitExpression) {
      found = true;
      return;
    }
    if (current.type === AST_NODE_TYPES.ForOfStatement && current.await) {
      found = true;
      return;
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent') continue;
      const child = (current as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              walk(item as TSESTree.Node);
            }
          }
        } else if ('type' in child) {
          walk(child as TSESTree.Node);
        }
      }
    }
  }

  walk(node);
  return found;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-async-loop-callback',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow async callbacks in cancForAwait and cancGenForAwait loops.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      asyncLoopCallback:
        "An async callback awaits a promise that cannot be canceled, so a cancel cannot interrupt the work for the current item. Use a generator function and 'yield* cancAwait(...)' inside it.",
      convertToGenerator: 'Turn the callback into a generator function.',
      removeAsync: "Remove 'async' from the callback.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (node.arguments.length !== 2) {
          return;
        }

        const isCancLoop =
          refersTo(node.callee, context, 'cancForAwait') || refersTo(node.callee, context, 'cancGenForAwait');

        if (!isCancLoop) {
          return;
        }

        const cbArg = node.arguments[1];
        if (!cbArg) {
          return;
        }

        const unwrapped = unwrapCallback(cbArg);
        if (
          unwrapped.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          unwrapped.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        if (!unwrapped.async) {
          return;
        }

        const containsAwait = hasAwait(unwrapped.body);
        const sourceCode = context.sourceCode;

        if (containsAwait) {
          context.report({
            node: unwrapped,
            messageId: 'asyncLoopCallback',
          });
          return;
        }

        // Body contains no await: offer suggestion to remove async / convert to generator
        if (unwrapped.type === AST_NODE_TYPES.FunctionExpression) {
          context.report({
            node: unwrapped,
            messageId: 'asyncLoopCallback',
            suggest: [
              {
                messageId: 'convertToGenerator',
                fix(fixer) {
                  const asyncToken = sourceCode.getFirstToken(unwrapped);
                  if (!asyncToken || asyncToken.value !== 'async') {
                    return null;
                  }
                  const functionToken = sourceCode.getTokenAfter(asyncToken);
                  if (!functionToken || functionToken.value !== 'function') {
                    return null;
                  }
                  return fixer.replaceTextRange([asyncToken.range[0], functionToken.range[1]], 'function*');
                },
              },
            ],
          });
        } else {
          // ArrowFunctionExpression
          context.report({
            node: unwrapped,
            messageId: 'asyncLoopCallback',
            suggest: [
              {
                messageId: 'removeAsync',
                fix(fixer) {
                  const asyncToken = sourceCode.getFirstToken(unwrapped);
                  if (!asyncToken || asyncToken.value !== 'async') {
                    return null;
                  }
                  const nextToken = sourceCode.getTokenAfter(asyncToken);
                  if (!nextToken) {
                    return null;
                  }
                  return fixer.removeRange([asyncToken.range[0], nextToken.range[0]]);
                },
              },
            ],
          });
        }
      },
    };
  },
});
