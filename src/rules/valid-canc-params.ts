import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isCancCtorIdent, isLazyCtorIdent, refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'tooFewArguments' | 'tooManyArguments' | 'invalidArgumentShape';
export type RuleOptions = [];

type Context = TSESLint.RuleContext<MessageIds, RuleOptions>;

const STATIC_ARITIES: Record<string, { min: number; max: number }> = {
  all: { min: 1, max: 2 },
  race: { min: 1, max: 2 },
  any: { min: 1, max: 2 },
  allSettled: { min: 1, max: 2 },
  resolve: { min: 0, max: 2 },
  reject: { min: 0, max: 2 },
  withResolvers: { min: 0, max: 1 },
};

const INSTANCE_ARITIES: Record<string, { min: number; max: number }> = {
  then: { min: 0, max: 2 },
  catch: { min: 0, max: 1 },
  finally: { min: 0, max: 1 },
  handleCancel: { min: 1, max: 2 },
};

function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
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

function isFunctionLike(node: TSESTree.Node): boolean {
  const unwrapped = unwrapExpression(node);
  return (
    unwrapped.type === AST_NODE_TYPES.FunctionExpression ||
    unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    unwrapped.type === AST_NODE_TYPES.Identifier ||
    unwrapped.type === AST_NODE_TYPES.MemberExpression ||
    unwrapped.type === AST_NODE_TYPES.CallExpression
  );
}

function isMatchingTypeAnnotation(typeAnnotation: TSESTree.TSTypeAnnotation, context: Context): boolean {
  const typeNode = typeAnnotation.typeAnnotation;
  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = typeNode.typeName;
    if (typeName.type === AST_NODE_TYPES.Identifier) {
      return (
        typeName.name === 'CancelablePromise' ||
        typeName.name === 'LazyPromise' ||
        refersTo(typeName, context, 'CancelablePromise') ||
        isLazyCtorIdent(typeName, context)
      );
    }
    if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
      return typeName.right.name === 'CancelablePromise' || typeName.right.name === 'LazyPromise';
    }
  }
  return false;
}

function isTrackedIdentifier(
  idNode: TSESTree.Identifier,
  context: Context,
  seen: Set<TSESTree.Identifier> = new Set(),
): boolean {
  if (seen.has(idNode)) {
    return false;
  }
  seen.add(idNode);

  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(idNode);
  let variable: TSESLint.Scope.Variable | undefined;
  while (scope) {
    variable = scope.variables.find((v) => v.name === idNode.name);
    if (variable) {
      break;
    }
    scope = scope.upper;
  }
  if (!variable) {
    return false;
  }

  for (const def of variable.defs) {
    if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
      const init = unwrapExpression(def.node.init);
      if (isTrackedReceiver(init, context, seen)) {
        return true;
      }
    }

    const nameNode = def.name;
    if (nameNode.type === AST_NODE_TYPES.Identifier && nameNode.typeAnnotation) {
      if (isMatchingTypeAnnotation(nameNode.typeAnnotation, context)) {
        return true;
      }
    }

    if (def.node.type === AST_NODE_TYPES.VariableDeclarator) {
      const declId = def.node.id;
      if (declId.type === AST_NODE_TYPES.Identifier && declId.typeAnnotation) {
        if (isMatchingTypeAnnotation(declId.typeAnnotation, context)) {
          return true;
        }
      }
    }
  }

  return false;
}

function isTrackedReceiver(obj: TSESTree.Node, context: Context, seen: Set<TSESTree.Identifier> = new Set()): boolean {
  const unwrapped = unwrapExpression(obj);
  if (unwrapped.type === AST_NODE_TYPES.NewExpression) {
    const callee = unwrapExpression(unwrapped.callee);
    return isCancCtorIdent(callee, context) || isLazyCtorIdent(callee, context);
  }
  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapExpression(unwrapped.callee);
    if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
      const calleeObj = unwrapExpression(callee.object);
      if (isCancCtorIdent(calleeObj, context) || isLazyCtorIdent(calleeObj, context)) {
        return true;
      }
      return isTrackedReceiver(calleeObj, context, seen);
    }
    return false;
  }
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return isTrackedIdentifier(unwrapped, context, seen);
  }
  return false;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'valid-canc-params',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce valid parameter count and shapes for cancelable promise methods.',
    },
    schema: [],
    messages: {
      tooFewArguments: "'{{callee}}' needs at least {{min}} argument(s).",
      tooManyArguments: "'{{callee}}' takes at most {{max}} argument(s). Extra arguments are ignored.",
      invalidArgumentShape: "'{{callee}}' expects {{expected}} here.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
          return;
        }
        if (node.callee.property.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const method = node.callee.property.name;
        if (node.arguments.some((a) => a.type === AST_NODE_TYPES.SpreadElement)) {
          return;
        }

        const callee = context.sourceCode.getText(node.callee);
        const receiver = unwrapExpression(node.callee.object);
        const isStatic = isCancCtorIdent(receiver, context) || isLazyCtorIdent(receiver, context);

        if (isStatic) {
          if (method === 'try') {
            if (node.arguments.length === 0) {
              context.report({
                node,
                messageId: 'tooFewArguments',
                data: { callee, min: 1 },
              });
              return;
            }
            if (node.arguments[0].type === AST_NODE_TYPES.ObjectExpression) {
              if (node.arguments.length < 2 || !isFunctionLike(node.arguments[1])) {
                context.report({
                  node,
                  messageId: 'invalidArgumentShape',
                  data: { callee, expected: 'a function after the options' },
                });
                return;
              }
              return;
            }
            return;
          }

          if (method in STATIC_ARITIES) {
            const arity = STATIC_ARITIES[method];
            if (node.arguments.length < arity.min) {
              context.report({
                node,
                messageId: 'tooFewArguments',
                data: { callee, min: arity.min },
              });
              return;
            }
            if (node.arguments.length > arity.max) {
              context.report({
                node: node.arguments[arity.max],
                messageId: 'tooManyArguments',
                data: { callee, max: arity.max },
              });
              return;
            }
          }
          return;
        }

        if (isTrackedReceiver(receiver, context)) {
          if (method in INSTANCE_ARITIES) {
            const arity = INSTANCE_ARITIES[method];
            if (node.arguments.length < arity.min) {
              context.report({
                node,
                messageId: 'tooFewArguments',
                data: { callee, min: arity.min },
              });
              return;
            }
            if (node.arguments.length > arity.max) {
              context.report({
                node: node.arguments[arity.max],
                messageId: 'tooManyArguments',
                data: { callee, max: arity.max },
              });
              return;
            }
          }
        }
      },
    };
  },
});
