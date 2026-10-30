import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'noCancelWiring';
export type RuleOptions = [];

/** True when the constructor options literally set `shield: true`: a shielded promise ignores cancel. */
function isShielded(node: TSESTree.NewExpression): boolean {
  const options = node.arguments.at(1);
  if (options?.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  return options.properties.some(
    (prop) =>
      prop.type === AST_NODE_TYPES.Property &&
      !prop.computed &&
      ((prop.key.type === AST_NODE_TYPES.Identifier && prop.key.name === 'shield') ||
        (prop.key.type === AST_NODE_TYPES.Literal && prop.key.value === 'shield')) &&
      prop.value.type === AST_NODE_TYPES.Literal &&
      prop.value.value === true,
  );
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

        if (isShielded(node)) {
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
