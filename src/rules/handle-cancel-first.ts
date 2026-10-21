import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'lateRegistration';
export type RuleOptions = [];

export default createRule<RuleOptions, MessageIds>({
  name: 'handle-cancel-first',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require cancel handlers to be registered synchronously at the top of the executor.',
    },
    schema: [],
    messages: {
      lateRegistration:
        'This cancel handler is registered after the executor handed control away, so a cancel that arrives earlier is missed. Register it synchronously at the top of the executor.',
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

        for (const call of shape.handleCancelCalls) {
          if (call.late) {
            context.report({
              node: call.node,
              messageId: 'lateRegistration',
            });
          }
        }
      },
    };
  },
});
