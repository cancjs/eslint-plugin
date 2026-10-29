import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isCoroutineFnIdent } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'asyncFunction' | 'asyncGenerator' | 'anyReturnAnnotation';
export type RuleOptions = [];

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
  name: 'valid-cancasync',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure coroutines are driven by valid generator functions with proper type annotations.',
    },
    schema: [],
    messages: {
      asyncFunction:
        "'{{driver}}' needs a generator function. An async function has no steps for the driver to run or cancel. Use 'function*' and write 'yield* {{await}}(...)' for each await.",
      asyncGenerator:
        "'{{driver}}' cannot drive an async generator. Use a plain generator function and write 'yield* {{await}}(...)' for each await.",
      anyReturnAnnotation:
        "A return type of 'any' on a coroutine makes every 'yield*' step 'any', which removes per-step type inference. Remove the annotation, or state the result with 'AsyncResult' (or 'AsyncGenResult' for cancGenAsync).",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const isCanc = isCoroutineFnIdent(node.callee, context, 'cancAsync');
        const isCancGen = isCoroutineFnIdent(node.callee, context, 'cancGenAsync');
        if (!isCanc && !isCancGen) {
          return;
        }

        const arg0 = node.arguments[0];
        if (!arg0) {
          return;
        }

        const unwrapped = unwrapParens(arg0);
        if (
          unwrapped.type !== AST_NODE_TYPES.FunctionExpression &&
          unwrapped.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          unwrapped.type !== AST_NODE_TYPES.FunctionDeclaration
        ) {
          return;
        }

        const driver = context.sourceCode.getText(node.callee);
        const awaitName = isCancGen ? 'cancGenAwait' : 'cancAwait';

        if (unwrapped.async && !unwrapped.generator) {
          context.report({
            node: unwrapped,
            messageId: 'asyncFunction',
            data: { driver, await: awaitName },
          });
          return;
        }

        if (unwrapped.async && unwrapped.generator) {
          context.report({
            node: unwrapped,
            messageId: 'asyncGenerator',
            data: { driver, await: awaitName },
          });
          return;
        }

        if (unwrapped.returnType) {
          const typeNode = unwrapped.returnType.typeAnnotation;
          if (typeNode.type === AST_NODE_TYPES.TSAnyKeyword) {
            context.report({
              node: unwrapped.returnType,
              messageId: 'anyReturnAnnotation',
            });
            return;
          }

          if (
            typeNode.type === AST_NODE_TYPES.TSTypeReference &&
            typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
            (typeNode.typeName.name === 'Generator' || typeNode.typeName.name === 'AsyncGenerator') &&
            typeNode.typeArguments &&
            typeNode.typeArguments.params.length >= 3 &&
            typeNode.typeArguments.params[2].type === AST_NODE_TYPES.TSAnyKeyword
          ) {
            context.report({
              node: unwrapped.returnType,
              messageId: 'anyReturnAnnotation',
            });
          }
        }
      },
    };
  },
});
