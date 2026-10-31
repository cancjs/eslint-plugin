import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isGlobalPromiseIdent } from './adoption.js';
import {
  isCancAwaitIdent,
  isCancCtorIdent,
  isCancGenAwaitIdent,
  isCoroutineFnIdent,
  isLazyCtorIdent,
  isThrowHelperCall,
  refersTo,
} from './canc-imports.js';
import { getCancServices, isCancelableExpression, isCancelableType } from './canc-types.js';
import { unwrapTypeOnly } from './executor.js';
import type { ResolvedCancSettings } from './settings.js';

export interface CatchSite {
  kind: 'callback' | 'clause';
  handler: TSESTree.FunctionLike | TSESTree.CatchClause;
  param: TSESTree.BindingName | null;
  flowNode: TSESTree.Node;
}

export interface HandlerAnalysis {
  compliant: boolean;
  via: 'guard' | 'rethrow' | 'boundary' | 'logReturn' | null;
  wrapped: boolean;
  destructured: boolean;
  param: TSESTree.Identifier | null;
}

export interface AnalyzeHandlerOptions {
  allowLogAndReturn?: boolean;
  allowEmptyCatch?: boolean;
}

type Context = TSESLint.RuleContext<string, unknown[]>;

const BOUNDARY_NAMES = new Set([
  'catchCancel',
  'suppressCancel',
  'catchAbort',
  'suppressAbort',
  'catchTimeout',
  'suppressTimeout',
  'catchErrors',
  'suppressErrors',
]);

function isCancExpressionSyntactic(node: TSESTree.Expression, context: Context): boolean {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return isCancCtorIdent(node.callee, context) || isLazyCtorIdent(node.callee, context);
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = node.callee;
    if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
      if (isCancCtorIdent(callee.object, context) || isLazyCtorIdent(callee.object, context)) {
        return true;
      }
    }
    if (
      isCoroutineFnIdent(callee, context, 'cancAsync') ||
      isCoroutineFnIdent(callee, context, 'cancGenAsync') ||
      refersTo(callee, context, 'makeCancelable') ||
      refersTo(callee, context, 'cancelify') ||
      refersTo(callee, context, 'defer') ||
      refersTo(callee, context, 'delay')
    ) {
      return true;
    }
  }
  return false;
}

function isChainRootCancelable(expr: TSESTree.Expression, context: Context): boolean {
  let current: TSESTree.Expression = expr;
  while (
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression &&
    !current.callee.computed
  ) {
    if (isCancExpressionSyntactic(current, context)) {
      return true;
    }
    current = current.callee.object;
  }
  return isCancExpressionSyntactic(current, context);
}

function isCancelableReceiver(
  receiver: TSESTree.Expression,
  context: Context,
  settings: ResolvedCancSettings,
): boolean {
  if (isCancelableExpression(receiver, context, settings)) {
    return true;
  }
  return isChainRootCancelable(receiver, context);
}

/**
 * Return catch sites within an AST node. Inspects TryStatement clauses
 * and cancelable Promise.catch / Promise.then callback handlers.
 */
export function getCatchSites(node: TSESTree.Node, context: Context, settings: ResolvedCancSettings): CatchSite[] {
  if (node.type === AST_NODE_TYPES.TryStatement) {
    if (node.handler && isCancelableFlowCatch(node.handler, context, settings)) {
      return [
        {
          kind: 'clause',
          handler: node.handler,
          param: node.handler.param,
          flowNode: node.handler,
        },
      ];
    }
    return [];
  }

  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = node.callee;
    if (
      callee.type !== AST_NODE_TYPES.MemberExpression ||
      callee.computed ||
      callee.property.type !== AST_NODE_TYPES.Identifier
    ) {
      return [];
    }
    const methodName = callee.property.name;
    if (methodName !== 'catch' && methodName !== 'then') {
      return [];
    }
    if (!isCancelableReceiver(callee.object, context, settings)) {
      return [];
    }

    if (methodName === 'catch') {
      if (node.arguments.length === 0) {
        return [];
      }
      const arg = node.arguments[0];
      if (arg.type === AST_NODE_TYPES.ArrowFunctionExpression || arg.type === AST_NODE_TYPES.FunctionExpression) {
        const param = (arg.params[0] as TSESTree.BindingName | undefined) ?? null;
        return [
          {
            kind: 'callback',
            handler: arg,
            param,
            flowNode: node,
          },
        ];
      }
      return [];
    }

    if (node.arguments.length >= 2) {
      const onRejected = node.arguments[1];
      if (
        onRejected.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        onRejected.type === AST_NODE_TYPES.FunctionExpression
      ) {
        const param = (onRejected.params[0] as TSESTree.BindingName | undefined) ?? null;
        return [
          {
            kind: 'callback',
            handler: onRejected,
            param,
            flowNode: node,
          },
        ];
      }
    }
    return [];
  }

  return [];
}

function isExpressionIdentifier(node: TSESTree.Identifier): boolean {
  const parent = node.parent;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.property === node && !parent.computed) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.key === node && !parent.computed) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.MethodDefinition) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === node) {
    return false;
  }
  if (
    parent.type === AST_NODE_TYPES.FunctionDeclaration ||
    parent.type === AST_NODE_TYPES.FunctionExpression ||
    parent.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.TSTypeAnnotation || parent.type === AST_NODE_TYPES.TSTypeReference) {
    return false;
  }
  return true;
}

function isNode(val: unknown): val is TSESTree.Node {
  return typeof val === 'object' && val !== null && 'type' in val;
}

function tryBlockHasCancelable(
  block: TSESTree.BlockStatement,
  context: Context,
  settings: ResolvedCancSettings,
): boolean {
  const services = getCancServices(context);
  const checker = services?.program.getTypeChecker();

  function visit(node: TSESTree.Node): boolean {
    if (node.type === AST_NODE_TYPES.TryStatement) {
      if (node.handler) {
        return node.finalizer ? visit(node.finalizer) : false;
      }
    }

    if (
      node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return false;
    }

    if (node.type === AST_NODE_TYPES.YieldExpression && node.delegate) {
      if (node.argument.type === AST_NODE_TYPES.CallExpression) {
        const callee = node.argument.callee;
        if (isCancAwaitIdent(callee, context) || isCancGenAwaitIdent(callee, context)) {
          if (!services) {
            return true;
          }
          if (node.argument.arguments.length > 0) {
            const arg = node.argument.arguments[0];
            if (arg.type !== AST_NODE_TYPES.SpreadElement) {
              if (isCancelableExpression(arg, context, settings) || isCancExpressionSyntactic(arg, context)) {
                return true;
              }
            }
          }
        }
      }
    }

    if (node.type === AST_NODE_TYPES.NewExpression) {
      if (isCancCtorIdent(node.callee, context) || isLazyCtorIdent(node.callee, context)) {
        return true;
      }
      if (services && isCancelableExpression(node, context, settings)) {
        return true;
      }
    }

    if (services) {
      if (node.type === AST_NODE_TYPES.AwaitExpression) {
        if (
          isCancelableExpression(node.argument, context, settings) ||
          isCancExpressionSyntactic(node.argument, context)
        ) {
          return true;
        }
      }

      if (node.type === AST_NODE_TYPES.CallExpression) {
        if (isCancelableExpression(node, context, settings)) {
          return true;
        }
      }

      if (node.type === AST_NODE_TYPES.Identifier && isExpressionIdentifier(node)) {
        if (!isCancCtorIdent(node, context) && !isLazyCtorIdent(node, context)) {
          const type = services.getTypeAtLocation(node);
          if (checker && isCancelableType(type, checker, settings)) {
            return true;
          }
        }
      }
    } else {
      if (node.type === AST_NODE_TYPES.CallExpression && isCancExpressionSyntactic(node, context)) {
        return true;
      }
    }

    for (const key of Object.keys(node) as (keyof TSESTree.Node)[]) {
      if (key === 'parent') {
        continue;
      }
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (isNode(child) && visit(child)) {
            return true;
          }
        }
      } else if (isNode(val) && visit(val)) {
        return true;
      }
    }

    return false;
  }

  for (const stmt of block.body) {
    if (visit(stmt)) {
      return true;
    }
  }

  return false;
}

/**
 * Report whether the try block enclosing `catchClause` is part of a cancelable flow.
 */
export function isCancelableFlowCatch(
  catchClause: TSESTree.CatchClause,
  context: Context,
  settings: ResolvedCancSettings,
): boolean {
  const parent = catchClause.parent;
  return tryBlockHasCancelable(parent.block, context, settings);
}

// `yield* cancThrow(e)` and `return yield* cancThrow(e)` rethrow inside a coroutine
function isThrowHelperRethrow(stmt: TSESTree.Statement, paramName: string, context: Context): boolean {
  const expression =
    stmt.type === AST_NODE_TYPES.ExpressionStatement ? stmt.expression
    : stmt.type === AST_NODE_TYPES.ReturnStatement ? stmt.argument
    : null;
  if (expression?.type !== AST_NODE_TYPES.YieldExpression || !expression.delegate) {
    return false;
  }
  const call = expression.argument;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    isThrowHelperCall(call, context) !== null &&
    call.arguments[0]?.type === AST_NODE_TYPES.Identifier &&
    call.arguments[0].name === paramName
  );
}

// Promise.reject(e) rejects the derived promise with the same error
function isRejectRethrow(node: TSESTree.Node | null | undefined, paramName: string, context: Context): boolean {
  if (!node) {
    return false;
  }
  let inner = unwrapTypeOnly(node);
  if (inner.type === AST_NODE_TYPES.AwaitExpression) {
    inner = unwrapTypeOnly(inner.argument);
  }
  if (
    inner.type !== AST_NODE_TYPES.CallExpression ||
    inner.callee.type !== AST_NODE_TYPES.MemberExpression ||
    inner.callee.computed ||
    inner.callee.property.type !== AST_NODE_TYPES.Identifier ||
    inner.callee.property.name !== 'reject' ||
    inner.arguments.length !== 1
  ) {
    return false;
  }
  const obj = inner.callee.object;
  const isPromiseObj =
    isGlobalPromiseIdent(obj, context) ||
    isCancCtorIdent(obj, context) ||
    (obj.type === AST_NODE_TYPES.MemberExpression &&
      !obj.computed &&
      obj.property.type === AST_NODE_TYPES.Identifier &&
      obj.property.name === 'Promise' &&
      obj.object.type === AST_NODE_TYPES.Identifier &&
      obj.object.name === 'globalThis');
  if (!isPromiseObj) {
    return false;
  }
  const arg = unwrapTypeOnly(inner.arguments[0]);
  return arg.type === AST_NODE_TYPES.Identifier && arg.name === paramName;
}

function returnsRejection(stmt: TSESTree.ReturnStatement, paramName: string, context: Context): boolean {
  return stmt.argument !== null && isRejectingConditional(stmt.argument, paramName, context);
}

function statementRethrowsParam(stmt: TSESTree.Statement, paramName: string, context: Context): boolean {
  if (stmt.type === AST_NODE_TYPES.ThrowStatement) {
    return stmt.argument.type === AST_NODE_TYPES.Identifier && stmt.argument.name === paramName;
  }
  if (isThrowHelperRethrow(stmt, paramName, context)) {
    return true;
  }
  if (stmt.type === AST_NODE_TYPES.ReturnStatement && returnsRejection(stmt, paramName, context)) {
    return true;
  }
  if (stmt.type === AST_NODE_TYPES.BlockStatement) {
    for (const inner of stmt.body) {
      if (statementRethrowsParam(inner, paramName, context)) {
        return true;
      }
    }
  }
  return false;
}

function isCancelCheck(node: TSESTree.Node, paramName: string, context: Context): boolean {
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'instanceof') {
    const left = unwrapTypeOnly(node.left);
    if (
      left.type === AST_NODE_TYPES.Identifier &&
      left.name === paramName &&
      refersTo(node.right, context, 'CancelError')
    ) {
      return true;
    }
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    if (node.arguments.length === 0) {
      return false;
    }
    const arg0 = node.arguments[0];
    if (arg0.type !== AST_NODE_TYPES.Identifier || arg0.name !== paramName) {
      return false;
    }

    const callee = node.callee;
    if (refersTo(callee, context, 'isCancelError')) {
      return true;
    }
    if (
      refersTo(callee, context, 'isErrorOf') &&
      node.arguments.length >= 2 &&
      refersTo(node.arguments[1], context, 'CancelError')
    ) {
      return true;
    }
    if (
      callee.type === AST_NODE_TYPES.CallExpression &&
      refersTo(callee.callee, context, 'createIsError') &&
      callee.arguments.length > 0 &&
      refersTo(callee.arguments[0], context, 'CancelError')
    ) {
      return true;
    }
    if (callee.type === AST_NODE_TYPES.Identifier) {
      if (callee.name === 'isCancelError') {
        return true;
      }
      const scope = context.sourceCode.getScope(callee);
      const variable = scope.variables.find((v) => v.name === callee.name);
      if (variable) {
        for (const def of variable.defs) {
          if (
            def.node.type === AST_NODE_TYPES.VariableDeclarator &&
            def.node.init?.type === AST_NODE_TYPES.CallExpression
          ) {
            const init = def.node.init;
            if (
              refersTo(init.callee, context, 'createIsError') &&
              init.arguments.length > 0 &&
              refersTo(init.arguments[0], context, 'CancelError')
            ) {
              return true;
            }
          }
        }
      }
    }
  }

  if (node.type === AST_NODE_TYPES.LogicalExpression && node.operator === '||') {
    return isCancelCheck(node.left, paramName, context) || isCancelCheck(node.right, paramName, context);
  }

  return false;
}

function checkCancelGuard(
  ifStmt: TSESTree.IfStatement,
  paramName: string,
  statementsAfter: TSESTree.Statement[],
  context: Context,
): 'rethrow' | 'swallow' | 'none' {
  if (isCancelCheck(ifStmt.test, paramName, context)) {
    if (statementRethrowsParam(ifStmt.consequent, paramName, context)) {
      return 'rethrow';
    }
    return 'swallow';
  }

  if (
    ifStmt.test.type === AST_NODE_TYPES.UnaryExpression &&
    ifStmt.test.operator === '!' &&
    isCancelCheck(ifStmt.test.argument, paramName, context)
  ) {
    if (ifStmt.alternate) {
      if (statementRethrowsParam(ifStmt.alternate, paramName, context)) {
        return 'rethrow';
      }
      return 'swallow';
    }
    for (const stmt of statementsAfter) {
      if (statementRethrowsParam(stmt, paramName, context)) {
        return 'rethrow';
      }
    }
    return 'swallow';
  }

  return 'none';
}

// (e) => isCancelError(e) ? Promise.reject(e) : x rethrows on the cancel arm
function isRejectingConditional(body: TSESTree.Node, paramName: string, context: Context): boolean {
  if (isRejectRethrow(body, paramName, context)) {
    return true;
  }
  if (body.type !== AST_NODE_TYPES.ConditionalExpression) {
    return false;
  }
  if (isRejectRethrow(body.consequent, paramName, context) && isRejectRethrow(body.alternate, paramName, context)) {
    return true;
  }
  if (isCancelCheck(body.test, paramName, context)) {
    return isRejectRethrow(body.consequent, paramName, context);
  }
  if (
    body.test.type === AST_NODE_TYPES.UnaryExpression &&
    body.test.operator === '!' &&
    isCancelCheck(body.test.argument, paramName, context)
  ) {
    return isRejectRethrow(body.alternate, paramName, context);
  }
  return false;
}

function isBoundaryCall(
  node: TSESTree.Node,
  paramName: string,
  context: Context,
  settings: ResolvedCancSettings,
): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (node.arguments.length === 0) {
    return false;
  }
  const arg0 = node.arguments[0];
  if (arg0.type !== AST_NODE_TYPES.Identifier || arg0.name !== paramName) {
    return false;
  }

  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (settings.boundaryFunctions.includes(callee.name) || BOUNDARY_NAMES.has(callee.name)) {
      return true;
    }
  }

  for (const name of settings.boundaryFunctions) {
    if (refersTo(callee, context, name)) {
      return true;
    }
  }
  for (const name of BOUNDARY_NAMES) {
    if (refersTo(callee, context, name)) {
      return true;
    }
  }

  return false;
}

function hasBoundaryCallInStatements(
  statements: TSESTree.Statement[],
  paramName: string,
  context: Context,
  settings: ResolvedCancSettings,
): boolean {
  for (const stmt of statements) {
    if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
      if (isBoundaryCall(stmt.expression, paramName, context, settings)) {
        return true;
      }
    }
    if (stmt.type === AST_NODE_TYPES.BlockStatement) {
      if (hasBoundaryCallInStatements(stmt.body, paramName, context, settings)) {
        return true;
      }
    }
    if (stmt.type === AST_NODE_TYPES.IfStatement) {
      if (hasBoundaryCallInStatements([stmt.consequent], paramName, context, settings)) {
        return true;
      }
      if (stmt.alternate && hasBoundaryCallInStatements([stmt.alternate], paramName, context, settings)) {
        return true;
      }
    }
  }
  return false;
}

function hasRethrowInStatements(statements: TSESTree.Statement[], paramName: string, context: Context): boolean {
  for (const stmt of statements) {
    if (isThrowHelperRethrow(stmt, paramName, context)) {
      return true;
    }
    if (stmt.type === AST_NODE_TYPES.ThrowStatement) {
      if (stmt.argument.type === AST_NODE_TYPES.Identifier && stmt.argument.name === paramName) {
        return true;
      }
    }
    if (stmt.type === AST_NODE_TYPES.ReturnStatement && returnsRejection(stmt, paramName, context)) {
      return true;
    }
    if (stmt.type === AST_NODE_TYPES.IfStatement) {
      // the fallback of an else-if chain sits on the last alternate
      let alternate = stmt.alternate;
      while (alternate?.type === AST_NODE_TYPES.IfStatement) {
        alternate = alternate.alternate;
      }
      if (alternate && statementRethrowsParam(alternate, paramName, context)) {
        return true;
      }
    }
    if (stmt.type === AST_NODE_TYPES.SwitchStatement) {
      for (const switchCase of stmt.cases) {
        if (switchCase.test === null) {
          if (switchCase.consequent.some((s) => statementRethrowsParam(s, paramName, context))) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function findWrappedThrow(statements: TSESTree.Statement[], paramName: string | null): boolean {
  for (const stmt of statements) {
    if (stmt.type === AST_NODE_TYPES.ThrowStatement) {
      const arg = stmt.argument;
      if (arg.type === AST_NODE_TYPES.NewExpression) {
        return true;
      }
      if (arg.type === AST_NODE_TYPES.CallExpression) {
        return true;
      }
      if (arg.type === AST_NODE_TYPES.Identifier && paramName && arg.name !== paramName) {
        return true;
      }
    }
    if (stmt.type === AST_NODE_TYPES.BlockStatement) {
      if (findWrappedThrow(stmt.body, paramName)) {
        return true;
      }
    }
    if (stmt.type === AST_NODE_TYPES.IfStatement) {
      if (findWrappedThrow([stmt.consequent], paramName)) {
        return true;
      }
      if (stmt.alternate && findWrappedThrow([stmt.alternate], paramName)) {
        return true;
      }
    }
  }
  return false;
}

function isLogExpression(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
    if (callee.object.type === AST_NODE_TYPES.Identifier) {
      const objName = callee.object.name;
      if (objName === 'console' || objName === 'logger') {
        return true;
      }
    }
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (callee.name === 'log' || callee.name === 'logger') {
      return true;
    }
  }
  return false;
}

function statementsAllLogOrReturn(statements: TSESTree.Statement[]): boolean {
  if (statements.length === 0) {
    return false;
  }
  for (const stmt of statements) {
    if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
      if (!isLogExpression(stmt.expression)) {
        return false;
      }
    } else if (stmt.type === AST_NODE_TYPES.ReturnStatement) {
      continue;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Classify a catch clause or rejection callback handler for cancel compliance.
 */
export function analyzeHandler(
  handler: TSESTree.FunctionLike | TSESTree.CatchClause,
  context: Context,
  settings: ResolvedCancSettings,
  opts?: AnalyzeHandlerOptions,
): HandlerAnalysis {
  const paramNode = handler.type === AST_NODE_TYPES.CatchClause ? handler.param : (handler.params[0] ?? null);
  const body = handler.type === AST_NODE_TYPES.CatchClause ? handler.body : handler.body;

  let destructured = false;
  let param: TSESTree.Identifier | null = null;

  if (paramNode?.type === AST_NODE_TYPES.Identifier) {
    param = paramNode;
  } else if (paramNode?.type === AST_NODE_TYPES.ObjectPattern || paramNode?.type === AST_NODE_TYPES.ArrayPattern) {
    destructured = true;
  } else if (paramNode?.type === AST_NODE_TYPES.AssignmentPattern) {
    if (paramNode.left.type === AST_NODE_TYPES.Identifier) {
      param = paramNode.left;
    } else {
      destructured = true;
    }
  } else if (paramNode) {
    destructured = true;
  }

  if (!body) {
    return { compliant: false, via: null, wrapped: false, destructured, param };
  }

  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    if (param && isBoundaryCall(body, param.name, context, settings)) {
      return { compliant: true, via: 'boundary', wrapped: false, destructured, param };
    }
    if (param && isRejectingConditional(body, param.name, context)) {
      return { compliant: true, via: 'rethrow', wrapped: false, destructured, param };
    }
    if (opts?.allowLogAndReturn && isLogExpression(body)) {
      return { compliant: true, via: 'logReturn', wrapped: false, destructured, param };
    }
    return { compliant: false, via: null, wrapped: false, destructured, param };
  }

  const statements = body.body;

  if (statements.length === 0) {
    if (opts?.allowEmptyCatch) {
      return { compliant: true, via: null, wrapped: false, destructured, param };
    }
    return { compliant: false, via: null, wrapped: false, destructured, param };
  }

  if (destructured || !param) {
    if (opts?.allowLogAndReturn && statementsAllLogOrReturn(statements)) {
      return { compliant: true, via: 'logReturn', wrapped: false, destructured, param };
    }
    const wrapped = findWrappedThrow(statements, null);
    return { compliant: false, via: null, wrapped, destructured, param };
  }

  let guardSwallows = false;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.type === AST_NODE_TYPES.IfStatement) {
      const guardRes = checkCancelGuard(stmt, param.name, statements.slice(i + 1), context);
      if (guardRes === 'rethrow') {
        return { compliant: true, via: 'guard', wrapped: false, destructured: false, param };
      }
      if (guardRes === 'swallow') {
        guardSwallows = true;
      }
    }
  }

  if (guardSwallows) {
    const wrapped = findWrappedThrow(statements, param.name);
    return { compliant: false, via: null, wrapped, destructured: false, param };
  }

  if (hasBoundaryCallInStatements(statements, param.name, context, settings)) {
    return { compliant: true, via: 'boundary', wrapped: false, destructured: false, param };
  }

  if (hasRethrowInStatements(statements, param.name, context)) {
    return { compliant: true, via: 'rethrow', wrapped: false, destructured: false, param };
  }

  const wrapped = findWrappedThrow(statements, param.name);
  if (wrapped) {
    return { compliant: false, via: null, wrapped: true, destructured: false, param };
  }

  if (opts?.allowLogAndReturn && statementsAllLogOrReturn(statements)) {
    return { compliant: true, via: 'logReturn', wrapped: false, destructured: false, param };
  }

  return { compliant: false, via: null, wrapped: false, destructured: false, param };
}
