import { ScopeType } from '@typescript-eslint/scope-manager';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isHelperIdent, isLazyCtorIdent } from '../util/canc-imports.js';
import { isLazyExpression } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { getCancSettings } from '../util/settings.js';

export type MessageIds = 'unusedLazy' | 'unusedLazyVar';
export type RuleOptions = [];

const LAZY_STATICS = new Set(['try', 'resolve', 'reject', 'all', 'allSettled', 'any', 'race']);

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

function isLazyCreator(node: TSESTree.Node, context: TSESLint.RuleContext<MessageIds, RuleOptions>): boolean {
  const unwrapped = unwrapParens(node);

  if (unwrapped.type === AST_NODE_TYPES.NewExpression) {
    if (isLazyCtorIdent(unwrapped.callee, context)) {
      return true;
    }
  }

  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapped.callee;
    if (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      LAZY_STATICS.has(callee.property.name)
    ) {
      if (isLazyCtorIdent(callee.object, context)) {
        return true;
      }
    }

    if (isHelperIdent(callee, context, 'lazy') || isHelperIdent(callee, context, 'createLazyPromise')) {
      return true;
    }
  }

  const settings = getCancSettings(context);
  if (isLazyExpression(unwrapped, context, settings)) {
    return true;
  }

  return false;
}

function isLazyWithResolvers(node: TSESTree.Node, context: TSESLint.RuleContext<MessageIds, RuleOptions>): boolean {
  const unwrapped = unwrapParens(node);
  if (unwrapped.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped.callee;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'withResolvers'
  ) {
    return isLazyCtorIdent(callee.object, context);
  }
  return false;
}

function isResolverOnlyAccess(ref: TSESLint.Scope.Reference): boolean {
  const parent = ref.identifier.parent;
  return (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === ref.identifier &&
    !parent.computed &&
    parent.property.type === AST_NODE_TYPES.Identifier &&
    (parent.property.name === 'resolve' || parent.property.name === 'reject')
  );
}

function isUnusedVariable(
  id: TSESTree.Identifier,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
  ignoreRef?: (ref: TSESLint.Scope.Reference) => boolean,
): boolean {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(id);
  // Unused variable report is for local/module variables (excluding global/ambient)
  if (scope.type === ScopeType.global) {
    return false;
  }
  let variable: TSESLint.Scope.Variable | undefined;
  while (scope) {
    variable = scope.variables.find((v) => v.name === id.name);
    if (variable) {
      break;
    }
    scope = scope.upper;
  }
  if (!variable) {
    return false;
  }

  let consumingRefs = 0;
  for (const ref of variable.references) {
    if (ref.init) {
      continue;
    }
    if (ref.isWrite()) {
      continue;
    }
    if (ignoreRef?.(ref)) {
      continue;
    }
    let currNode: TSESTree.Node = ref.identifier;
    while (
      currNode.parent &&
      (currNode.parent.type === AST_NODE_TYPES.TSAsExpression ||
        currNode.parent.type === AST_NODE_TYPES.TSTypeAssertion ||
        currNode.parent.type === AST_NODE_TYPES.TSNonNullExpression)
    ) {
      currNode = currNode.parent;
    }
    const parent = currNode.parent;
    if (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'void') {
      continue;
    }
    consumingRefs++;
  }

  return consumingRefs === 0;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'must-consume-lazy',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure LazyPromise instances are consumed rather than dropped.',
    },
    schema: [],
    messages: {
      unusedLazy:
        "A LazyPromise does nothing until something subscribes, so this one never runs. Await it, return it, store it, or call 'execute()'.",
      unusedLazyVar:
        "'{{name}}' is a LazyPromise that is never used, so its executor never runs. Consume it or delete it.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ExpressionStatement(node) {
        let expr: TSESTree.Node = unwrapParens(node.expression);
        if (expr.type === AST_NODE_TYPES.UnaryExpression && expr.operator === 'void') {
          expr = unwrapParens(expr.argument);
        }

        if (isLazyCreator(expr, context) || isLazyWithResolvers(expr, context)) {
          context.report({
            node: expr,
            messageId: 'unusedLazy',
          });
        }
      },

      VariableDeclaration(node) {
        if (
          node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
          node.parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration
        ) {
          return;
        }

        for (const declarator of node.declarations) {
          if (!declarator.init) {
            continue;
          }

          if (isLazyWithResolvers(declarator.init, context)) {
            if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
              let hasLazyProp = false;
              for (const prop of declarator.id.properties) {
                if (prop.type === AST_NODE_TYPES.RestElement) {
                  hasLazyProp = true;
                  continue;
                }
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  ((prop.key.type === AST_NODE_TYPES.Identifier &&
                    (prop.key.name === 'lazy' || prop.key.name === 'promise')) ||
                    (prop.key.type === AST_NODE_TYPES.Literal &&
                      (prop.key.value === 'lazy' || prop.key.value === 'promise'))) &&
                  prop.value.type === AST_NODE_TYPES.AssignmentPattern
                ) {
                  hasLazyProp = true;
                  continue;
                }
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  ((prop.key.type === AST_NODE_TYPES.Identifier &&
                    (prop.key.name === 'lazy' || prop.key.name === 'promise')) ||
                    (prop.key.type === AST_NODE_TYPES.Literal &&
                      (prop.key.value === 'lazy' || prop.key.value === 'promise'))) &&
                  prop.value.type === AST_NODE_TYPES.Identifier
                ) {
                  hasLazyProp = true;
                  if (isUnusedVariable(prop.value, context)) {
                    context.report({
                      node: prop.value,
                      messageId: 'unusedLazyVar',
                      data: { name: prop.value.name },
                    });
                  }
                }
              }
              if (!hasLazyProp) {
                context.report({
                  node: declarator.init,
                  messageId: 'unusedLazy',
                });
              }
            } else if (declarator.id.type === AST_NODE_TYPES.Identifier) {
              if (isUnusedVariable(declarator.id, context, isResolverOnlyAccess)) {
                context.report({
                  node: declarator.id,
                  messageId: 'unusedLazyVar',
                  data: { name: declarator.id.name },
                });
              }
            }
            continue;
          }

          if (isLazyCreator(declarator.init, context)) {
            if (declarator.id.type === AST_NODE_TYPES.Identifier) {
              if (isUnusedVariable(declarator.id, context)) {
                context.report({
                  node: declarator.id,
                  messageId: 'unusedLazyVar',
                  data: { name: declarator.id.name },
                });
              }
            }
          }
        }
      },
    };
  },
});
