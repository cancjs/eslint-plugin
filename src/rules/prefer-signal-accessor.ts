import { DefinitionType, type Scope } from '@typescript-eslint/scope-manager';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { refersTo } from '../util/canc-imports.js';
import { isExecutorContextExpression } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'preferSignalAccessor';
export type RuleOptions = [];

function isDescendant(child: TSESTree.Node | undefined, ancestor: TSESTree.Node): boolean {
  let curr = child;
  while (curr) {
    if (curr === ancestor) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function hasSignalCollision(fn: TSESTree.Node, context: TSESLint.RuleContext<string, readonly unknown[]>): boolean {
  const fnScope = context.sourceCode.getScope(fn);

  function checkScope(scope: Scope): boolean {
    if (scope !== fnScope && scope.set.has('signal')) {
      return true;
    }
    for (const ref of scope.references) {
      if (ref.identifier.name === 'signal') {
        const defNode = ref.resolved?.defs[0]?.node;
        if (!ref.resolved || !defNode || !isDescendant(defNode, fn)) {
          return true;
        }
      }
    }
    for (const child of scope.childScopes) {
      if (checkScope(child)) {
        return true;
      }
    }
    return false;
  }

  if (fnScope.set.has('signal')) {
    return true;
  }

  return checkScope(fnScope);
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
    if (analyzeExecutor(parent, context) !== null) {
      return { isExecutor: true, isCancelify: false };
    }
  }

  if (parent.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === fn) {
    if (refersTo(parent.callee, context, 'cancelify')) {
      return { isExecutor: false, isCancelify: true };
    }
    if (refersTo(parent.callee, context, 'createLazyPromise') || refersTo(parent.callee, context, 'lazy')) {
      return { isExecutor: true, isCancelify: false };
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
    function isExecutorContextObject(node: TSESTree.Node): boolean {
      if (isExecutorContextExpression(node, context)) {
        return true;
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
        const hasCollision = !isRenamed && hasSignalCollision(fn, context);

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
