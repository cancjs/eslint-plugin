import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor, unwrapTypeOnly } from '../util/executor.js';

export type MessageIds = 'noCancelWiring';
export type RuleOptions = [];

function findVariable(
  node: TSESTree.Identifier,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): TSESLint.Scope.Variable | undefined {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.variables.find((v) => v.name === node.name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
  return undefined;
}

/** True when the constructor options literally set `shield: true`: a shielded promise ignores cancel. */
function isShielded(node: TSESTree.NewExpression, context: TSESLint.RuleContext<MessageIds, RuleOptions>): boolean {
  const options = node.arguments[1];
  if (!options) {
    return false;
  }
  let objExpr: TSESTree.ObjectExpression | null = null;
  if (options.type === AST_NODE_TYPES.ObjectExpression) {
    objExpr = options;
  } else if (options.type === AST_NODE_TYPES.Identifier) {
    const variable = findVariable(options, context);
    const def = variable?.defs.length === 1 ? variable.defs[0] : undefined;
    if (def?.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.parent.kind === 'const' && def.node.init) {
      const unwrapped = unwrapTypeOnly(def.node.init);
      if (unwrapped.type === AST_NODE_TYPES.ObjectExpression) {
        objExpr = unwrapped;
      }
    }
  }
  if (!objExpr) {
    return false;
  }

  let foundShieldIndex = -1;
  for (let i = 0; i < objExpr.properties.length; i++) {
    const prop = objExpr.properties[i];
    if (
      prop.type === AST_NODE_TYPES.Property &&
      !prop.computed &&
      ((prop.key.type === AST_NODE_TYPES.Identifier && prop.key.name === 'shield') ||
        (prop.key.type === AST_NODE_TYPES.Literal && prop.key.value === 'shield')) &&
      prop.value.type === AST_NODE_TYPES.Literal &&
      prop.value.value === true
    ) {
      foundShieldIndex = i;
    }
  }

  if (foundShieldIndex === -1) {
    return false;
  }

  for (let i = foundShieldIndex + 1; i < objExpr.properties.length; i++) {
    if (objExpr.properties[i].type === AST_NODE_TYPES.SpreadElement) {
      return false;
    }
  }

  return true;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'executor-cancel-wiring',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require cancelable promise executors to wire cancellation to underlying operations.',
    },
    schema: [],
    messages: {
      noCancelWiring:
        "Cancelling this promise stops the chain but not the underlying work. Register a cancel handler, pass 'getSignal()' to the operation, or acknowledge the leak with a disable comment.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      NewExpression(node) {
        const shape = analyzeExecutor(node, context);
        if (!shape) {
          return;
        }

        if (shape.operationStarts.length === 0 && !shape.asyncDriverInside) {
          return;
        }

        if (isShielded(node, context)) {
          return;
        }

        const hasHandleCancel = shape.handleCancelCalls.length > 0;
        const hasSignalForwarded = shape.signalForwarded;
        const hasCtorOption = Boolean(shape.ctorOptionsNode);
        const hasLazyTeardown = shape.ctorKind === 'lazy' && shape.returnsFunction;

        if (!hasHandleCancel && !hasSignalForwarded && !hasCtorOption && !hasLazyTeardown) {
          context.report({
            node: shape.executor,
            messageId: 'noCancelWiring',
          });
        }
      },
    };
  },
});
