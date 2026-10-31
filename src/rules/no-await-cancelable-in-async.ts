import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getAdoptionForm } from '../util/adoption.js';
import {
  getCancServices,
  hasCancelableElements,
  hasPlainPromiseMember,
  isCancelableExpression,
  isLazyExpression,
} from '../util/canc-types.js';
import { compileMatchers, matchesName } from '../util/class-matcher.js';
import createRule from '../util/create-rule.js';
import { getCancSettings } from '../util/settings.js';

export type MessageIds = 'awaitErasesCancelability' | 'forAwaitErasesCancelability';

export interface Options {
  allowTopLevel?: boolean;
  allowInFunctions?: string[];
}

export type RuleOptions = [Options];

const FIX_HINT =
  "Convert the function to a coroutine with 'cancAsync' and 'cancAwait', or consume the promise at a boundary with 'catchCancel' or 'suppressCancel'.";

function isFunctionLike(node: TSESTree.Node): node is TSESTree.FunctionLike {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function enclosingFunction(node: TSESTree.Node): TSESTree.FunctionLike | null {
  let current = node.parent;
  while (current) {
    if (isFunctionLike(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function keyName(key: TSESTree.Node): string | null {
  if (key.type === AST_NODE_TYPES.Identifier || key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

// declaration name, the variable an expression initializes, or the method or property key
function functionName(fn: TSESTree.FunctionLike): string | null {
  if (fn.id) {
    return fn.id.name;
  }
  const parent = fn.parent;
  switch (parent.type) {
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.init === fn && parent.id.type === AST_NODE_TYPES.Identifier ? parent.id.name : null;
    case AST_NODE_TYPES.MethodDefinition:
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.Property:
      return parent.value === fn && !parent.computed ? keyName(parent.key) : null;
    default:
      return null;
  }
}

function unwrapChain(node: TSESTree.Expression): TSESTree.Expression {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

// awaiting a cancel request waits for cleanup, it does not consume the work
function isCancelCall(node: TSESTree.Expression): boolean {
  const call = unwrapChain(node);
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.computed &&
    call.callee.property.type === AST_NODE_TYPES.Identifier &&
    call.callee.property.name === 'cancel'
  );
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-await-cancelable-in-async',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow awaiting cancelable promises in plain async functions',
      requiresTypeChecking: true,
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowTopLevel: {
            type: 'boolean',
            description: 'Allow awaiting cancelable promises at the module top level.',
          },
          allowInFunctions: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
            description:
              "Function names, or '/pattern/flags' regex strings, whose bodies may await cancelable promises.",
          },
        },
      },
    ],
    defaultOptions: [{ allowTopLevel: true, allowInFunctions: [] }],
    messages: {
      awaitErasesCancelability: `Awaiting a cancelable promise in a plain async function makes this code cancellation-blind: a cancel never stops the function, which keeps running after the work is cancelled. ${FIX_HINT}`,
      forAwaitErasesCancelability:
        "Iterating cancelable promises with 'for await' in a plain async function makes this code cancellation-blind: a cancel never stops the loop. Convert the function to a coroutine, or consume each promise at a boundary.",
    },
  },
  defaultOptions: [{ allowTopLevel: true, allowInFunctions: [] }],
  create(context, [options]) {
    if (!getCancServices(context)) {
      return {};
    }

    const settings = getCancSettings(context);
    const allowedFunctions = compileMatchers(options.allowInFunctions ?? []);

    function inCheckedScope(node: TSESTree.Node): boolean {
      const fn = enclosingFunction(node);
      if (!fn) {
        return options.allowTopLevel === false;
      }
      if (!fn.async) {
        return false;
      }
      const name = functionName(fn);
      return name === null || !matchesName(allowedFunctions, name);
    }

    function isErasedCancelable(node: TSESTree.Expression): boolean {
      return (
        isCancelableExpression(node, context, settings) &&
        !isLazyExpression(node, context, settings) &&
        !hasPlainPromiseMember(node, context)
      );
    }

    return {
      AwaitExpression(node) {
        const argument = node.argument;
        if (isCancelCall(argument) || getAdoptionForm(unwrapChain(argument), context)) {
          return;
        }
        if (inCheckedScope(node) && isErasedCancelable(argument)) {
          context.report({ node: argument, messageId: 'awaitErasesCancelability' });
        }
      },

      ForOfStatement(node) {
        if (!node.await || !inCheckedScope(node)) {
          return;
        }
        if (hasCancelableElements(node.right, context, settings) && !isLazyExpression(node.right, context, settings)) {
          context.report({ node: node.right, messageId: 'forAwaitErasesCancelability' });
        }
      },
    };
  },
});
