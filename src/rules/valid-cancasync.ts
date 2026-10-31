import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isCoroutineFnIdent } from '../util/canc-imports.js';
import { isNonIteratorReturnFunction } from '../util/canc-types.js';
import {
  calleeDialect,
  type FactoryOptions,
  factoryOptionsConstraints,
  factoryOptionsSchema,
  resolveFactories,
} from '../util/coroutine-factories.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'asyncFunction' | 'syncFunction' | 'asyncGenerator' | 'anyReturnAnnotation';
export type RuleOptions = [FactoryOptions?];

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
    // parameter defs point at the owning function, so match the def name too
    for (const def of variable.defs) {
      if (def.node.type === AST_NODE_TYPES.FunctionDeclaration && def.node.id === def.name) {
        return { fn: def.node, isIdentifier: true };
      }
      if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.id === def.name && def.node.init) {
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
      asyncFunction:
        "'{{driver}}' needs a generator function. An async function has no steps for the driver to run or cancel. Use 'function*' and write 'yield* {{await}}(...)' for each await.",
      syncFunction:
        "'{{driver}}' needs a generator function. This function returns a value that is not an iterator, so the driver has no steps to run or cancel. Use 'function*' and write 'yield* {{await}}(...)' for each await.",
      asyncGenerator:
        "'{{driver}}' cannot drive an async generator. Use a plain generator function and write 'yield* {{await}}(...)' for each await.",
      anyReturnAnnotation:
        "A return type of 'any' on a coroutine makes every 'yield*' step 'any', which removes per-step type inference. Remove the annotation, or state the result with 'AsyncResult' (or 'AsyncGenResult' for cancGenAsync).",
    },
  },
  defaultOptions: [{}],
  create(context) {
    const factories = resolveFactories(context.options[0]);

    return {
      CallExpression(node) {
        const dialect = calleeDialect(node.callee, context, factories);
        if (!dialect) {
          return;
        }
        const isCancGen = dialect === 'cancGenAsync';
        const isBuiltin =
          (!factories.replaceCancAsync && isCoroutineFnIdent(node.callee, context, 'cancAsync')) ||
          (!factories.replaceCancGenAsync && isCoroutineFnIdent(node.callee, context, 'cancGenAsync'));

        const arg0 = node.arguments[0];
        if (!arg0) {
          return;
        }

        const resolved = resolveFunction(arg0, context);
        if (!resolved) {
          return;
        }

        const { fn, isIdentifier } = resolved;
        // a configured factory may accept other shapes, so only plain generators are checked
        if (!isBuiltin && (!fn.generator || fn.async)) {
          return;
        }
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

        // a sync function may return a generator object, so only types can prove it wrong
        if (!fn.generator && (fn.async || isNonIteratorReturnFunction(fn, context))) {
          context.report({
            node: reportNode,
            messageId: fn.async ? 'asyncFunction' : 'syncFunction',
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
            const isAnyAt = (index: number): boolean =>
              params.length > index && params[index].type === AST_NODE_TYPES.TSAnyKeyword;
            if (isAnyAt(1) || isAnyAt(2)) {
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
