import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'noCancelWiring';
export type RuleOptions = [];

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
