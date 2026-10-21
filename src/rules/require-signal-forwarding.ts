import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import type { HandleCancelCall } from '../util/executor.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'signalNotForwarded';
export type RuleOptions = [];

function hasAbortCall(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'abort'
  ) {
    return true;
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }
    const val = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && 'type' in item) {
          if (hasAbortCall(item as TSESTree.Node)) {
            return true;
          }
        }
      }
    } else if (val && typeof val === 'object' && 'type' in val) {
      if (hasAbortCall(val as TSESTree.Node)) {
        return true;
      }
    }
  }
  return false;
}

function findAbortingCancelCall(handleCancelCalls: HandleCancelCall[]): HandleCancelCall | undefined {
  for (const call of handleCancelCalls) {
    if (call.node.arguments.length > 0 && hasAbortCall(call.node.arguments[0])) {
      return call;
    }
  }
  return undefined;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'require-signal-forwarding',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require AbortController signals to be forwarded to operations when cancel aborts the controller.',
    },
    schema: [],
    messages: {
      signalNotForwarded:
        "The cancel handler aborts a controller whose signal is never passed to the operation, so the work keeps running after cancel. Pass 'controller.signal' to the operation.",
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

        const abortingCall = findAbortingCancelCall(shape.handleCancelCalls);
        if (!abortingCall) {
          return;
        }

        if (shape.controllerForwarded) {
          return;
        }

        if (shape.signalReads.length > 0) {
          return;
        }

        context.report({
          node: abortingCall.node,
          messageId: 'signalNotForwarded',
        });
      },
    };
  },
});
