import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import { hasTypeServices, isPrimitiveExpression, isThenableExpression } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';

const { DefinitionType } = TSESLint.Scope;
type Scope = TSESLint.Scope.Scope;

export type MessageIds = 'manualCancelWiring';
export type RuleOptions = [];

function getEnclosingFunction(node: TSESTree.Node): TSESTree.Node | null {
  let curr = node.parent;
  while (curr) {
    if (
      curr.type === AST_NODE_TYPES.FunctionDeclaration ||
      curr.type === AST_NODE_TYPES.FunctionExpression ||
      curr.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

function getEnclosingTry(node: TSESTree.Node, enclosingFn: TSESTree.Node): TSESTree.TryStatement | null {
  let curr: TSESTree.Node | undefined = node.parent;
  while (curr && curr !== enclosingFn) {
    if (curr.parent?.type === AST_NODE_TYPES.TryStatement && curr.parent.finalizer === curr) {
      return curr.parent;
    }
    curr = curr.parent;
  }
  return null;
}

function isDescendantOf(child: TSESTree.Node, parent: TSESTree.Node): boolean {
  let curr: TSESTree.Node | undefined = child.parent;
  while (curr) {
    if (curr === parent) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function isAbortControllerOrSignalInit(
  init: TSESTree.Expression | null | undefined,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  if (!init) {
    return false;
  }
  if (init.type === AST_NODE_TYPES.NewExpression) {
    const callee = init.callee;
    if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'AbortController') {
      return true;
    }
    if (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      callee.property.name === 'AbortController'
    ) {
      return true;
    }
  }
  if (init.type === AST_NODE_TYPES.CallExpression) {
    if (refersTo(init.callee, context, 'createAbortSignal') || refersTo(init.callee, context, 'createCancelSignal')) {
      return true;
    }
  }
  return false;
}

function findCallPassingSignal(
  node: TSESTree.Node,
  container: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  let curr: TSESTree.Node | undefined = node.parent;
  while (curr && curr !== container) {
    if (curr.type === AST_NODE_TYPES.CallExpression) {
      if (curr.callee !== node && curr.arguments.some((arg) => isDescendantOf(node, arg) || arg === node)) {
        // a non-thenable call (options builder, any-typed helper) may hand the signal on
        if (!hasTypeServices(context) || isThenableExpression(curr, context)) {
          return true;
        }
        // a primitive result (a flag read from the signal) cannot carry the signal further
        if (isPrimitiveExpression(curr, context)) {
          return false;
        }
      }
    }
    curr = curr.parent;
  }
  return false;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-cancel-aware-wrapper',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer cancelify or promisify over hand-rolled signal threading and finally abort.',
    },
    schema: [],
    messages: {
      manualCancelWiring:
        "This coroutine creates a signal, passes it to calls, and aborts it in 'finally'. Wrap the operation once with 'cancelify' or 'promisify' so a cancel aborts it without manual cleanup.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Must be abort() or controller.abort() or cancel()
        let isAbortCall = false;
        let targetVarName: string | null = null;
        let isMemberCall = false;

        if (node.callee.type === AST_NODE_TYPES.Identifier && ['abort', 'cancel'].includes(node.callee.name)) {
          isAbortCall = true;
          targetVarName = node.callee.name;
        } else if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          !node.callee.computed &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          ['abort', 'cancel'].includes(node.callee.property.name)
        ) {
          isAbortCall = true;
          isMemberCall = true;
          if (node.callee.object.type === AST_NODE_TYPES.Identifier) {
            targetVarName = node.callee.object.name;
          }
        }

        if (!isAbortCall || !targetVarName) {
          return;
        }

        // Must be in a coroutine context
        const coroutineCtx = getCoroutineContext(node, context);
        if (!coroutineCtx) {
          return;
        }

        const genFn = coroutineCtx.genFn;
        const enclosingFn = getEnclosingFunction(node);
        if (enclosingFn !== genFn) {
          // If inside a nested function's finally, do not report
          return;
        }

        // Must be inside finally block of a TryStatement
        const tryStmt = getEnclosingTry(node, genFn);
        if (!tryStmt) {
          return;
        }

        // Look up variable in scope
        const scope = context.sourceCode.getScope(node);
        let currentScope: Scope | null = scope;
        let variable = null;

        while (currentScope) {
          const v = currentScope.set.get(targetVarName);
          if (v) {
            variable = v;
            break;
          }
          currentScope = currentScope.upper;
        }

        if (!variable || variable.defs.length === 0) {
          return;
        }

        const def = variable.defs[0];
        if (def.type !== DefinitionType.Variable) {
          return;
        }

        const decl = def.node;
        if (!decl.init) {
          return;
        }

        // Must be declared inside the coroutine
        if (!isDescendantOf(decl, genFn)) {
          return;
        }

        // Check if init is AbortController / createAbortSignal / createCancelSignal
        let signalVarName: string | null = null;
        let isControllerObject = false;

        if (decl.id.type === AST_NODE_TYPES.ObjectPattern) {
          // e.g. const { signal, abort } = createAbortSignal();
          if (!isAbortControllerOrSignalInit(decl.init, context)) {
            return;
          }
          for (const prop of decl.id.properties) {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              !prop.computed &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'signal' &&
              prop.value.type === AST_NODE_TYPES.Identifier
            ) {
              signalVarName = prop.value.name;
              break;
            }
          }
        } else if (decl.id.type === AST_NODE_TYPES.Identifier && isMemberCall) {
          // e.g. const controller = new AbortController(); controller.abort();
          if (!isAbortControllerOrSignalInit(decl.init, context)) {
            return;
          }
          isControllerObject = true;
        } else {
          return;
        }

        // Check if the signal is threaded into >= 1 call in the coroutine body
        let signalPassedToCall = false;

        if (signalVarName) {
          // Find references to signalVarName
          let sScope: Scope | null = scope;
          let sVar = null;
          while (sScope) {
            const v = sScope.set.get(signalVarName);
            if (v) {
              sVar = v;
              break;
            }
            sScope = sScope.upper;
          }

          if (sVar) {
            for (const ref of sVar.references) {
              if (ref.identifier === decl.id) continue;
              if (
                isDescendantOf(ref.identifier, tryStmt.block) &&
                findCallPassingSignal(ref.identifier, tryStmt.block, context)
              ) {
                signalPassedToCall = true;
                break;
              }
            }
          }
        } else if (isControllerObject) {
          // Check references to controller variable for controller.signal passed to call
          for (const ref of variable.references) {
            if (ref.identifier === decl.id) continue;
            const parent = ref.identifier.parent;
            if (
              parent?.type === AST_NODE_TYPES.MemberExpression &&
              !parent.computed &&
              parent.property.type === AST_NODE_TYPES.Identifier &&
              parent.property.name === 'signal'
            ) {
              if (isDescendantOf(parent, tryStmt.block) && findCallPassingSignal(parent, tryStmt.block, context)) {
                signalPassedToCall = true;
                break;
              }
            }
          }
        }

        if (!signalPassedToCall) {
          return;
        }

        context.report({
          node,
          messageId: 'manualCancelWiring',
        });
      },
    };
  },
});
