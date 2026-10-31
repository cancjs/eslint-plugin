import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, AST_TOKEN_TYPES } from '@typescript-eslint/utils';

import { refersTo } from './canc-imports.js';
import { getCancSettings } from './settings.js';

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

/**
 * Deliberate downgrade of a cancelable value into a plain promise, written so the intent is visible
 * in the code. `explicitWrap` covers `Promise.resolve(x)` and `new Promise((r) => r(x))`, `asCast`
 * covers `as`, angle-bracket and JSDoc casts to a promise type, `boundary` covers calls to boundary
 * helpers such as `catchCancel(x)`.
 */
export type AdoptionForm = 'explicitWrap' | 'asCast' | 'boundary';

// boundary helpers shipped by canc packages: matched through the import tracker only
const BUILTIN_BOUNDARY_NAMES = new Set([
  'catchCancel',
  'suppressCancel',
  'catchAbort',
  'suppressAbort',
  'catchTimeout',
  'suppressTimeout',
  'catchErrors',
  'suppressErrors',
]);

const PROMISE_TYPE_NAMES = new Set(['Promise', 'PromiseLike']);

const JSDOC_PROMISE_CAST = /^\*\s*@type\s*\{\s*(?:Promise|PromiseLike)\b/u;

/** True when `node` is the identifier `Promise` and resolves to the global, not a local or imported binding. */
export function isGlobalPromiseIdent(node: TSESTree.Node, context: Context): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || node.name !== 'Promise') {
    return false;
  }
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get('Promise');
    if (variable && variable.defs.length > 0) {
      return false;
    }
    scope = scope.upper;
  }
  return true;
}

function isPromiseTypeNode(node: TSESTree.TypeNode): boolean {
  return (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    PROMISE_TYPE_NAMES.has(node.typeName.name)
  );
}

function isFunctionNode(
  node: TSESTree.Node | undefined,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return node?.type === AST_NODE_TYPES.ArrowFunctionExpression || node?.type === AST_NODE_TYPES.FunctionExpression;
}

/** Executor of `new Promise(executor)` on the global `Promise`, or null. */
function globalPromiseExecutor(
  node: TSESTree.Node,
  context: Context,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  if (node.type !== AST_NODE_TYPES.NewExpression || !isGlobalPromiseIdent(node.callee, context)) {
    return null;
  }
  const executor = node.arguments[0];
  return isFunctionNode(executor) ? executor : null;
}

function resolveParamName(executor: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): string | null {
  const param = executor.params[0];
  return param?.type === AST_NODE_TYPES.Identifier ? param.name : null;
}

function isResolveCallOf(node: TSESTree.Node | null | undefined, name: string): node is TSESTree.CallExpression {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === name &&
    node.arguments.length === 1 &&
    node.arguments[0].type !== AST_NODE_TYPES.SpreadElement
  );
}

/** The single `resolve(x)` call that makes up the executor body, or null when the body does anything else. */
function executorResolveCall(
  executor: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): TSESTree.CallExpression | null {
  const name = resolveParamName(executor);
  if (!name) {
    return null;
  }
  if (executor.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isResolveCallOf(executor.body, name) ? executor.body : null;
  }
  const [only, ...rest] = executor.body.body;
  if (rest.length > 0 || only?.type !== AST_NODE_TYPES.ExpressionStatement) {
    return null;
  }
  return isResolveCallOf(only.expression, name) ? only.expression : null;
}

/** Enclosing `new Promise` when `call` is the `resolve(x)` body of its executor. */
function enclosingWrapOfResolveCall(call: TSESTree.CallExpression, context: Context): TSESTree.NewExpression | null {
  let executor: TSESTree.Node | undefined = call.parent;
  if (executor?.type === AST_NODE_TYPES.ExpressionStatement) {
    executor = executor.parent?.parent;
  }
  if (!isFunctionNode(executor) || executor.parent.type !== AST_NODE_TYPES.NewExpression) {
    return null;
  }
  const wrap = executor.parent;
  return globalPromiseExecutor(wrap, context) === executor && executorResolveCall(executor) === call ? wrap : null;
}

function isJsdocPromiseCast(node: TSESTree.Node, context: Context): boolean {
  const sourceCode = context.sourceCode;
  const open = sourceCode.getTokenBefore(node);
  const close = sourceCode.getTokenAfter(node);
  if (open?.value !== '(' || close?.value !== ')') {
    return false;
  }
  const parent = node.parent;
  if (
    parent &&
    (parent.type === AST_NODE_TYPES.CallExpression || parent.type === AST_NODE_TYPES.NewExpression) &&
    parent.arguments[0] === node &&
    sourceCode.getTokenAfter(parent.callee, { filter: (token) => token.value === '(' }) === open
  ) {
    return false;
  }
  const comment = sourceCode.getTokenBefore(open, { includeComments: true });
  return comment?.type === AST_TOKEN_TYPES.Block && JSDOC_PROMISE_CAST.test(comment.value);
}

function isBoundaryCallee(callee: TSESTree.Node, context: Context): boolean {
  const { boundaryFunctions } = getCancSettings(context);
  if (boundaryFunctions.some((name) => refersTo(callee, context, name))) {
    return true;
  }
  // configured project helpers are local code, so the name is the only handle on them
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    !BUILTIN_BOUNDARY_NAMES.has(callee.name) &&
    boundaryFunctions.includes(callee.name)
  );
}

/**
 * Classify `node` as a sanctioned adoption form, or null. Recognizes `Promise.resolve(x)` and
 * `new Promise((r) => r(x))` on the global `Promise` (a shadowed or imported `Promise` does not
 * count), the inner `r(x)` call of that executor, `as` and angle-bracket casts to `Promise` or
 * `PromiseLike` (including `as unknown as`), a parenthesized JSDoc `@type {Promise<T>}` cast, and
 * calls to boundary helpers (import-tracked, so renamed imports match). `satisfies` and `!` are not
 * adoption forms: the value keeps its type.
 */
export function getAdoptionForm(node: TSESTree.Node, context: Context): AdoptionForm | null {
  switch (node.type) {
    case AST_NODE_TYPES.CallExpression: {
      const callee = node.callee;
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'resolve' &&
        isGlobalPromiseIdent(callee.object, context)
      ) {
        return 'explicitWrap';
      }
      if (enclosingWrapOfResolveCall(node, context)) {
        return 'explicitWrap';
      }
      if (isBoundaryCallee(callee, context)) {
        return 'boundary';
      }
      break;
    }
    case AST_NODE_TYPES.NewExpression: {
      const executor = globalPromiseExecutor(node, context);
      if (executor && executorResolveCall(executor)) {
        return 'explicitWrap';
      }
      break;
    }
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      if (isPromiseTypeNode(node.typeAnnotation)) {
        return 'asCast';
      }
      break;
    default:
      break;
  }
  return isJsdocPromiseCast(node, context) ? 'asCast' : null;
}

/**
 * The expression an adoption form adopts: the wrapped argument for wraps and boundary calls, the
 * innermost operand for (chained) casts, the node itself for a JSDoc cast. Null when `node` is not
 * an adoption form.
 */
export function getAdoptedOperand(node: TSESTree.Node, context: Context): TSESTree.Node | null {
  const form = getAdoptionForm(node, context);
  if (!form) {
    return null;
  }
  if (node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSTypeAssertion) {
    let inner: TSESTree.Node = node.expression;
    while (inner.type === AST_NODE_TYPES.TSAsExpression || inner.type === AST_NODE_TYPES.TSTypeAssertion) {
      inner = inner.expression;
    }
    return inner;
  }
  if (form === 'asCast') {
    return node;
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    const executor = globalPromiseExecutor(node, context);
    return (executor && executorResolveCall(executor)?.arguments[0]) ?? null;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return node.arguments[0] ?? null;
  }
  return node;
}
