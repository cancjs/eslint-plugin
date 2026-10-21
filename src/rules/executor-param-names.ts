import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'badParamName';

export interface ExecutorParamNamesOptions {
  resolve?: string;
  reject?: string;
  context?: string;
  handleCancel?: string;
}

export type RuleOptions = [ExecutorParamNamesOptions?];

const DEFAULT_RESOLVE = '^_?resolve$';
const DEFAULT_REJECT = '^_?reject$';
const DEFAULT_CONTEXT = '^_?(ctx|context)$';
const DEFAULT_HANDLE_CANCEL = '^_?(handleCancel|hc)$';

function extractIdentifierName(param: TSESTree.Parameter | undefined): string | undefined {
  if (!param) {
    return undefined;
  }
  if (param.type === AST_NODE_TYPES.Identifier) {
    return param.name;
  }
  if (param.type === AST_NODE_TYPES.AssignmentPattern && param.left.type === AST_NODE_TYPES.Identifier) {
    return param.left.name;
  }
  return undefined;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'executor-param-names',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce standard parameter names for cancelable promise executors.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          resolve: {
            type: 'string',
            description: 'Pattern matching valid resolve parameter names.',
          },
          reject: {
            type: 'string',
            description: 'Pattern matching valid reject parameter names.',
          },
          context: {
            type: 'string',
            description: 'Pattern matching valid context parameter names.',
          },
          handleCancel: {
            type: 'string',
            description: 'Pattern matching valid legacy handleCancel parameter names.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      badParamName: "Name executor parameter {{position}} '{{expected}}' instead of '{{actual}}'.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const resolveRegex = new RegExp(options?.resolve ?? DEFAULT_RESOLVE);
    const rejectRegex = new RegExp(options?.reject ?? DEFAULT_REJECT);
    const contextRegex = new RegExp(options?.context ?? DEFAULT_CONTEXT);
    const handleCancelRegex = new RegExp(options?.handleCancel ?? DEFAULT_HANDLE_CANCEL);

    return {
      NewExpression(node) {
        const shape = analyzeExecutor(node, context);
        if (!shape) {
          return;
        }

        const params = shape.executor.params;

        if (params.length > 0) {
          const param0 = params[0];
          const name = extractIdentifierName(param0) ?? 'unknown';
          if (!resolveRegex.test(name)) {
            context.report({
              node: param0,
              messageId: 'badParamName',
              data: {
                position: 'first',
                expected: 'resolve',
                actual: name,
              },
            });
          }
        }

        if (params.length > 1) {
          const param1 = params[1];
          const name = extractIdentifierName(param1) ?? 'unknown';
          if (!rejectRegex.test(name)) {
            context.report({
              node: param1,
              messageId: 'badParamName',
              data: {
                position: 'second',
                expected: 'reject',
                actual: name,
              },
            });
          }
        }

        if (params.length > 2) {
          const param2 = params[2];
          let target: TSESTree.Node = param2;
          if (target.type === AST_NODE_TYPES.AssignmentPattern) {
            target = target.left;
          }

          if (target.type === AST_NODE_TYPES.ObjectPattern) {
            return;
          }

          if (target.type === AST_NODE_TYPES.Identifier) {
            const name = target.name;
            if (!contextRegex.test(name) && !handleCancelRegex.test(name)) {
              context.report({
                node: param2,
                messageId: 'badParamName',
                data: {
                  position: 'third',
                  expected: 'context',
                  actual: name,
                },
              });
            }
          } else {
            context.report({
              node: param2,
              messageId: 'badParamName',
              data: {
                position: 'third',
                expected: 'context',
                actual: 'unknown',
              },
            });
          }
        }
      },
    };
  },
});
