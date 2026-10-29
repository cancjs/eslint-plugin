import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
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

function isGeneratorTypeName(typeName: TSESTree.EntityName): boolean {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return typeName.name === 'Generator' || typeName.name === 'AsyncGenerator';
  }
  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    return isGeneratorTypeName(typeName.right);
  }
  return false;
}

function resolveFunction(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): {
  fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
  isIdentifier: boolean;
} | null {
  const unwrapped = unwrapParens(node);
  if (
    unwrapped.type === AST_NODE_TYPES.FunctionExpression ||
    unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    unwrapped.type === AST_NODE_TYPES.FunctionDeclaration
  ) {
    return { fn: unwrapped, isIdentifier: false };
  }
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    const scope = context.sourceCode.getScope(unwrapped);
    let curr: TSESLint.Scope.Scope | null = scope;
    let variable: TSESLint.Scope.Variable | undefined;
    while (curr) {
      variable = curr.variables.find((v: TSESLint.Scope.Variable) => v.name === unwrapped.name);
      if (variable) break;
      curr = curr.upper;
    }
    if (!variable || variable.defs.length === 0) {
      return null;
    }
    for (const def of variable.defs) {
      if (def.node.type === AST_NODE_TYPES.FunctionDeclaration) {
        return { fn: def.node, isIdentifier: true };
      }
      if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
        const init = unwrapParens(def.node.init);
        if (
          init.type === AST_NODE_TYPES.FunctionExpression ||
          init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init.type === AST_NODE_TYPES.FunctionDeclaration
        ) {
          return { fn: init, isIdentifier: true };
        }
      }
    }
  }
  return null;
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

        const resolved = resolveFunction(arg0, context);
        if (!resolved) {
          return;
        }

        const { fn, isIdentifier } = resolved;
        const driver = context.sourceCode.getText(node.callee);
        const awaitName = isCancGen ? 'cancGenAwait' : 'cancAwait';
        const reportNode = isIdentifier ? unwrapParens(arg0) : fn;

        if (fn.async && fn.generator) {
          context.report({
            node: reportNode,
            messageId: 'asyncGenerator',
            data: { driver, await: awaitName },
          });
          return;
        }

        if (!fn.generator) {
          context.report({
            node: reportNode,
            messageId: 'asyncFunction',
            data: { driver, await: awaitName },
          });
          return;
        }

        if (fn.returnType) {
          const typeNode = fn.returnType.typeAnnotation;
          if (typeNode.type === AST_NODE_TYPES.TSAnyKeyword) {
            context.report({
              node: fn.returnType,
              messageId: 'anyReturnAnnotation',
            });
            return;
          }

          if (
            typeNode.type === AST_NODE_TYPES.TSTypeReference &&
            isGeneratorTypeName(typeNode.typeName) &&
            typeNode.typeArguments
          ) {
            const params = typeNode.typeArguments.params;
            if (
              (params.length >= 3 && params[2].type === AST_NODE_TYPES.TSAnyKeyword) ||
              (params.length === 1 && params[0].type === AST_NODE_TYPES.TSAnyKeyword)
            ) {
              context.report({
                node: fn.returnType,
                messageId: 'anyReturnAnnotation',
              });
            }
          }
        }
      },
    };
  },
});
