import { DefinitionType, type Scope } from '@typescript-eslint/scope-manager';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { refersTo } from '../util/canc-imports.js';
import { getCancServices } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'preferSignalAccessor';
export type RuleOptions = [];

function isTrackedConstructor(node: TSESTree.Node, context: TSESLint.RuleContext<string, readonly unknown[]>): boolean {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    const callee = node.callee;
    if (callee.type === AST_NODE_TYPES.Identifier) {
      if (
        callee.name === 'CancelablePromise' ||
        callee.name === 'LazyPromise' ||
        refersTo(callee, context, 'CancelablePromise') ||
        refersTo(callee, context, 'LazyPromise')
      ) {
        return true;
      }
    }
  }
  return false;
}

function isCancelifyCall(node: TSESTree.Node, context: TSESLint.RuleContext<string, readonly unknown[]>): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = node.callee;
    if (callee.type === AST_NODE_TYPES.Identifier) {
      if (callee.name === 'cancelify' || refersTo(callee, context, 'cancelify')) {
        return true;
      }
    }
  }
  return false;
}

function isExecutorOrCancelifyCallback(
  fn: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): { isExecutor: boolean; isCancelify: boolean } {
  const parent = fn.parent;
  if (!parent) {
    return { isExecutor: false, isCancelify: false };
  }

  if (parent.type === AST_NODE_TYPES.NewExpression && parent.arguments[0] === fn) {
    if (isTrackedConstructor(parent, context)) {
      return { isExecutor: true, isCancelify: false };
    }
  }

  if (parent.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === fn) {
    if (isCancelifyCall(parent, context)) {
      return { isExecutor: false, isCancelify: true };
    }
  }

  return { isExecutor: false, isCancelify: false };
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-signal-accessor',
  meta: {
    type: 'suggestion',
    docs: {
      description: "Prefer 'signal' accessor over deprecated 'getSignal()' on executor context.",
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      preferSignalAccessor: "'getSignal()' is deprecated. Read the 'signal' property instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = getCancServices(context);

    function isExecutorContextObject(node: TSESTree.Node): boolean {
      if (services?.program) {
        const type = services.getTypeAtLocation(node);
        if (type.getProperty('handleCancel') !== undefined && type.getProperty('getSignal') !== undefined) {
          return true;
        }
      }

      // AST check: is it a parameter of an executor (param 2) or cancelify (param 0)?
      if (node.type === AST_NODE_TYPES.Identifier) {
        const scope = context.sourceCode.getScope(node);
        let currScope: Scope | null = scope;
        let variable = null;
        while (currScope) {
          const v = currScope.set.get(node.name);
          if (v) {
            variable = v;
            break;
          }
          currScope = currScope.upper;
        }

        if (variable && variable.defs.length > 0) {
          const def = variable.defs[0];
          if (def.type === DefinitionType.Parameter) {
            const fn = def.node;
            if (fn.type === AST_NODE_TYPES.FunctionExpression || fn.type === AST_NODE_TYPES.ArrowFunctionExpression) {
              const { isExecutor, isCancelify } = isExecutorOrCancelifyCallback(fn, context);
              const paramIndex = fn.params.indexOf(def.name);
              if (isExecutor && paramIndex === 2) {
                return true;
              }
              if (isCancelify && paramIndex === 0) {
                return true;
              }
            }
            // Helper function parameter named ctx or context
            if (
              def.name.type === AST_NODE_TYPES.Identifier &&
              (def.name.name === 'ctx' || def.name.name === 'context')
            ) {
              return true;
            }
          }
        }
      }

      return false;
    }

    return {
      // 1. Member call: ctx.getSignal() -> ctx.signal
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.MemberExpression ||
          node.callee.computed ||
          node.callee.property.type !== AST_NODE_TYPES.Identifier ||
          node.callee.property.name !== 'getSignal'
        ) {
          return;
        }

        const callee = node.callee;
        const object = callee.object;
        if (!isExecutorContextObject(object)) {
          return;
        }

        context.report({
          node: callee.property,
          messageId: 'preferSignalAccessor',
          fix(fixer) {
            const objText = context.sourceCode.getText(object);
            const accessor = callee.optional ? '?.signal' : '.signal';
            return fixer.replaceText(node, `${objText}${accessor}`);
          },
        });
      },

      // 2. Destructuring parameter: { getSignal } -> { signal }
      Property(node) {
        if (
          node.parent.type !== AST_NODE_TYPES.ObjectPattern ||
          node.computed ||
          node.key.type !== AST_NODE_TYPES.Identifier ||
          node.key.name !== 'getSignal'
        ) {
          return;
        }

        const pattern = node.parent;
        const fn = pattern.parent;
        if (
          !fn ||
          (fn.type !== AST_NODE_TYPES.FunctionExpression && fn.type !== AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        const { isExecutor, isCancelify } = isExecutorOrCancelifyCallback(fn, context);
        const paramIndex = fn.params.indexOf(pattern);
        if (!(isExecutor && paramIndex === 2) && !(isCancelify && paramIndex === 0)) {
          return;
        }

        const scope = context.sourceCode.getScope(fn.body);
        const isRenamed =
          !node.shorthand && node.value.type === AST_NODE_TYPES.Identifier && node.value.name !== 'getSignal';
        const localBindingName =
          isRenamed && node.value.type === AST_NODE_TYPES.Identifier ? node.value.name : 'getSignal';

        // Check if 'signal' collides in scope (only relevant for non-renamed)
        const hasCollision = !isRenamed && scope.set.has('signal');

        function generateFix(fixer: TSESLint.RuleFixer) {
          const fixes: TSESLint.RuleFix[] = [];
          if (isRenamed) {
            // { getSignal: gs } -> { signal: gs }
            fixes.push(fixer.replaceText(node.key, 'signal'));
            // Rewrite calls to gs() to gs
            const variable = scope.set.get(localBindingName);
            if (variable) {
              for (const ref of variable.references) {
                if (ref.identifier === node.value) continue;
                const parent = ref.identifier.parent;
                if (parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === ref.identifier) {
                  fixes.push(fixer.replaceText(parent, localBindingName));
                }
              }
            }
          } else {
            // { getSignal } -> { signal }
            fixes.push(fixer.replaceText(node, 'signal'));
            // Rewrite calls to getSignal() to signal
            const variable = scope.set.get('getSignal');
            if (variable) {
              for (const ref of variable.references) {
                if (ref.identifier === node.key) continue;
                const parent = ref.identifier.parent;
                if (parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === ref.identifier) {
                  fixes.push(fixer.replaceText(parent, 'signal'));
                }
              }
            }
          }
          return fixes;
        }

        if (hasCollision) {
          // Suggestion only
          context.report({
            node: node.key,
            messageId: 'preferSignalAccessor',
            suggest: [
              {
                messageId: 'preferSignalAccessor',
                fix(fixer) {
                  return generateFix(fixer);
                },
              },
            ],
          });
        } else {
          // Autofix
          context.report({
            node: node.key,
            messageId: 'preferSignalAccessor',
            fix(fixer) {
              return generateFix(fixer);
            },
          });
        }
      },
    };
  },
});
