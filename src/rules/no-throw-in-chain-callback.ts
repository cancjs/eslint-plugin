import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type ts from 'typescript';

import { getCancBindings, getCoroutineContext, refersTo } from '../util/canc-imports.js';
import { isCancelableType, isLazyType } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { isCancelErrorCtorNode, isCancelErrorType } from '../util/failure-types.js';
import { getCancSettings, type ResolvedCancSettings } from '../util/settings.js';

export type MessageIds = 'throwInChainCallback' | 'rejectWithoutFailure';

export type RuleOptions = [];

type Context = TSESLint.RuleContext<MessageIds, RuleOptions>;

function getNearestEnclosingFunction(node: TSESTree.Node): TSESTree.FunctionLike | null {
  let curr: TSESTree.Node | undefined = node.parent;
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

function isCatchBindingRethrow(throwNode: TSESTree.ThrowStatement, callbackFn: TSESTree.FunctionLike): boolean {
  if (throwNode.argument.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const identName = throwNode.argument.name;

  let curr: TSESTree.Node | undefined = throwNode.parent;
  while (curr && curr !== callbackFn) {
    if (curr.type === AST_NODE_TYPES.CatchClause) {
      if (curr.param?.type === AST_NODE_TYPES.Identifier && curr.param.name === identName) {
        return true;
      }
    }
    curr = curr.parent;
  }
  return false;
}

function isCancelErrorThrow(
  argNode: TSESTree.Expression,
  context: Context,
  checker?: ts.TypeChecker,
  tsNode?: ts.Node,
  settings?: ResolvedCancSettings,
): boolean {
  if (isCancelErrorCtorNode(argNode, context)) {
    return true;
  }
  if (checker && tsNode) {
    const argType = checker.getTypeAtLocation(tsNode);
    if (isCancelErrorType(argType, checker, settings)) {
      return true;
    }
  }
  return false;
}

function getChainRoot(expr: TSESTree.Expression): TSESTree.Expression {
  let curr = expr;
  while (
    curr.type === AST_NODE_TYPES.CallExpression &&
    curr.callee.type === AST_NODE_TYPES.MemberExpression &&
    !curr.callee.computed &&
    curr.callee.property.type === AST_NODE_TYPES.Identifier &&
    (curr.callee.property.name === 'then' ||
      curr.callee.property.name === 'catch' ||
      curr.callee.property.name === 'finally')
  ) {
    curr = curr.callee.object;
  }
  return curr;
}

function isSynCancelableChainRoot(expr: TSESTree.Expression, context: Context): boolean {
  const root = getChainRoot(expr);
  if (root.type === AST_NODE_TYPES.NewExpression) {
    return refersTo(root.callee, context, 'CancelablePromise') || refersTo(root.callee, context, 'LazyPromise');
  }
  if (root.type === AST_NODE_TYPES.CallExpression) {
    if (
      root.callee.type === AST_NODE_TYPES.MemberExpression &&
      !root.callee.computed &&
      root.callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      return (
        refersTo(root.callee.object, context, 'CancelablePromise') ||
        refersTo(root.callee.object, context, 'LazyPromise')
      );
    }
  }
  return false;
}

function findInScopeCancelablePromise(context: Context): string | null {
  const bindings = getCancBindings(context);
  for (const [localName, binding] of bindings) {
    if (
      (binding.source === '@cancjs/promise' || binding.source.includes('canc-promise')) &&
      (binding.exported === 'CancelablePromise' || binding.exported === 'default')
    ) {
      return localName;
    }
  }
  return null;
}

interface CallbackInfo {
  method: 'then' | 'catch' | 'finally';
  receiver: TSESTree.Expression;
}

function isCancelablePromiseReceiverType(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
): boolean {
  if (isCancelableType(type, checker, settings) || isLazyType(type, checker, settings)) {
    return true;
  }
  const typeStr = checker.typeToString(type);
  if (typeStr.startsWith('CancelablePromise') || typeStr.startsWith('LazyPromise')) {
    return true;
  }
  const sym = type.aliasSymbol ?? type.getSymbol();
  if (sym) {
    if (sym.flags & 2097152 /* ts.SymbolFlags.Alias */) {
      try {
        const aliased = checker.getAliasedSymbol(sym);
        if (
          settings.cancelableTypeNames.includes(aliased.getName()) ||
          settings.lazyTypeNames.includes(aliased.getName())
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }
  return false;
}

function getCallbackInfo(
  fn: TSESTree.FunctionLike,
  context: Context,
  checker?: ts.TypeChecker,
  settings?: ResolvedCancSettings,
  esTreeNodeToTSNodeMap?: { get(node: TSESTree.Node): ts.Node | undefined },
): CallbackInfo | null {
  const call = fn.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return null;
  }
  if (call.callee.type !== AST_NODE_TYPES.MemberExpression || call.callee.computed) {
    return null;
  }
  if (call.callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const propName = call.callee.property.name;
  if (propName !== 'then' && propName !== 'catch' && propName !== 'finally') {
    return null;
  }

  if (propName === 'then') {
    if (call.arguments[0] !== fn && call.arguments[1] !== fn) {
      return null;
    }
  } else {
    if (call.arguments[0] !== fn) {
      return null;
    }
  }

  const receiver = call.callee.object;
  if (checker && esTreeNodeToTSNodeMap && settings) {
    const tsReceiver = esTreeNodeToTSNodeMap.get(receiver);
    if (!tsReceiver) {
      return null;
    }
    const type = checker.getTypeAtLocation(tsReceiver);
    if (isCancelablePromiseReceiverType(type, checker, settings)) {
      return { method: propName, receiver };
    }
    return null;
  }

  if (isSynCancelableChainRoot(receiver, context)) {
    return { method: propName, receiver };
  }

  return null;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-throw-in-chain-callback',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require returning CancelablePromise.fail() instead of throwing inside chain callbacks on cancelable promises.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      throwInChainCallback:
        "A throw inside a '{{method}}' callback is not part of the promise's declared failure type. Return 'CancelablePromise.fail(error)' instead.",
      rejectWithoutFailure:
        "'reject(error)' declares no failure type. Return 'CancelablePromise.fail(error)', or name the type with 'reject<never, E>(error)'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const parserServices = context.sourceCode.parserServices;
    const program = parserServices?.program;
    const checker = program ? program.getTypeChecker() : undefined;
    const esTreeNodeToTSNodeMap = parserServices?.esTreeNodeToTSNodeMap;
    const settings = getCancSettings(context);

    return {
      ThrowStatement(node) {
        const fn = getNearestEnclosingFunction(node);
        if (!fn || fn.type === AST_NODE_TYPES.FunctionDeclaration) {
          return;
        }

        // Coroutine body throw is owned by prefer-canc-throw
        if (getCoroutineContext(node, context)) {
          return;
        }

        const cbInfo = getCallbackInfo(fn, context, checker, settings, esTreeNodeToTSNodeMap);
        if (!cbInfo) {
          return;
        }

        if (isCatchBindingRethrow(node, fn)) {
          return;
        }

        const tsNode = esTreeNodeToTSNodeMap?.get(node.argument);
        if (isCancelErrorThrow(node.argument, context, checker, tsNode, settings)) {
          return;
        }

        const isTail =
          fn.body?.type === AST_NODE_TYPES.BlockStatement && fn.body.body[fn.body.body.length - 1] === node;

        const inScopeCP = findInScopeCancelablePromise(context);

        // H3: finally callbacks do not carry failure, so no suggestions in finally
        if (cbInfo.method !== 'finally' && isTail && inScopeCP) {
          const argText = context.sourceCode.getText(node.argument);
          context.report({
            node,
            messageId: 'throwInChainCallback',
            data: { method: cbInfo.method },
            suggest: [
              {
                messageId: 'throwInChainCallback',
                data: { method: cbInfo.method },
                fix(fixer) {
                  return fixer.replaceText(node, `return ${inScopeCP}.fail(${argText});`);
                },
              },
            ],
          });
        } else {
          context.report({
            node,
            messageId: 'throwInChainCallback',
            data: { method: cbInfo.method },
          });
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.MemberExpression ||
          node.callee.computed ||
          node.callee.property.type !== AST_NODE_TYPES.Identifier ||
          node.callee.property.name !== 'reject'
        ) {
          return;
        }

        const calleeObj = node.callee.object;
        const isCP =
          refersTo(calleeObj, context, 'CancelablePromise') ||
          (calleeObj.type === AST_NODE_TYPES.Identifier && calleeObj.name === 'CancelablePromise');
        if (!isCP) {
          return;
        }

        // Explicit type arguments (e.g. reject<never, E>(x)) are silent
        const hasTypeArgs =
          (node.typeArguments && node.typeArguments.params.length > 0) ||
          Boolean((node as unknown as { typeParameters?: { params?: unknown[] } }).typeParameters?.params?.length);
        if (hasTypeArgs) {
          return;
        }

        // Must be returned from the callback
        let fn: TSESTree.FunctionLike | null = null;
        if (node.parent.type === AST_NODE_TYPES.ReturnStatement) {
          fn = getNearestEnclosingFunction(node.parent);
        } else if (node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression && node.parent.body === node) {
          fn = node.parent;
        }

        if (!fn || fn.type === AST_NODE_TYPES.FunctionDeclaration) {
          return;
        }

        const cbInfo = getCallbackInfo(fn, context, checker, settings, esTreeNodeToTSNodeMap);
        if (!cbInfo) {
          return;
        }

        const propertyNode = node.callee.property;
        if (cbInfo.method !== 'finally') {
          context.report({
            node,
            messageId: 'rejectWithoutFailure',
            suggest: [
              {
                messageId: 'rejectWithoutFailure',
                fix(fixer) {
                  return fixer.replaceText(propertyNode, 'fail');
                },
              },
            ],
          });
        } else {
          context.report({
            node,
            messageId: 'rejectWithoutFailure',
          });
        }
      },
    };
  },
});
