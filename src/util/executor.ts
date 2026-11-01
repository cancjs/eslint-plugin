import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isCancCtorIdent, isLazyCtorIdent } from './canc-imports.js';

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

/** Which tracked constructor a `new` expression targets. */
export type ExecutorCtorKind = 'cancelable' | 'lazy';

/** Kind of context wiring on the third parameter. */
export type ExecutorContextKind = 'destructured' | 'identifier' | 'legacyFn' | 'none';

/** Executor parameter roles, resolved positionally (resolve, reject, handleCancel). */
export interface ExecutorParams {
  resolve: TSESTree.Parameter | undefined;
  reject: TSESTree.Parameter | undefined;
  /** Third positional parameter. Only meaningful for cancelable executors. */
  handleCancel: TSESTree.Parameter | undefined;
  /** Context parameter (third positional parameter) when present. */
  context: TSESTree.Parameter | undefined;
}

/** A call to the `handleCancel` parameter and whether it is registered late. */
export interface HandleCancelCall {
  node: TSESTree.CallExpression;
  /**
   * True when the call sits inside a nested function (a `.then` callback, timer
   * callback, or other continuation) rather than directly in the executor body:
   * a cancel arriving before the continuation runs is missed.
   */
  late: boolean;
}

/**
 * Structural classification of a tracked-constructor executor. Pure syntactic
 * analysis; every executor-family rule consumes this one walk rather than
 * re-traversing the executor. `null`-ish absence (no executor) is represented by
 * `analyzeExecutor` returning `null`.
 */
export interface ExecutorShape {
  ctorKind: ExecutorCtorKind;
  /** The executor function node (arrow or function expression). */
  executor: TSESTree.FunctionLike;
  params: ExecutorParams;
  /** Kind of context parameter wiring (destructured, identifier, legacyFn, or none). */
  contextKind: ExecutorContextKind;
  /** Executor is declared `async`. */
  isAsync: boolean;
  /**
   * An async IIFE or a call to a named async function drives the body (the
   * async-wrapper evasion of a synchronous executor).
   */
  asyncDriverInside: boolean;
  /**
   * Call expressions driving the executor asynchronously (inline async IIFEs or
   * calls to named async functions declared inside the executor).
   */
  asyncDriverCalls: TSESTree.CallExpression[];
  /**
   * Operation starts: call expressions whose result is consumed via `.then(...)`
   * or `await`, or passed to `resolve(...)`. Node list; length is the operation
   * count used by the monolithic-executor check.
   */
  operationStarts: TSESTree.CallExpression[];
  /**
   * A `resolve(...)` receives a non-trivial expression derived from an operation
   * result (e.g. `resolve(data.map(...))`) rather than the raw value.
   */
  transformsBeforeResolve: boolean;
  handleCancelCalls: HandleCancelCall[];
  /** Calls to `getSignal()` (either bare or via `ctx.getSignal()`). */
  getSignalCalls: TSESTree.CallExpression[];
  /**
   * True when a `getSignal()` result or its derived variable reaches a call
   * argument or option property in the executor body.
   */
  signalForwarded: boolean;
  /**
   * True when a wired abort controller is passed directly as an argument to a call
   * expression in the executor body (`fn(controller)`).
   */
  controllerForwarded: boolean;
  /**
   * Reads of `<id>.signal` or destructured signal references where `<id>` is an
   * object whose `.abort()` is wired through `handleCancel`. Empty means an abort
   * controller is wired but its signal is never forwarded.
   */
  signalReads: (TSESTree.MemberExpression | TSESTree.Identifier)[];
  /** Executor has a `return <value>` where the value is not a function. */
  returnsValue: boolean;
  /** Executor has a `return <fn>` (a teardown function, the lazy contract). */
  returnsFunction: boolean;
  /**
   * The constructor's second argument when it is an object expression carrying
   * `signal` and/or `ref` keys; otherwise `undefined`.
   */
  ctorOptionsNode: TSESTree.ObjectExpression | undefined;
}

const FUNCTION_TYPES = new Set<TSESTree.Node['type']>([
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

function isFunctionNode(node: TSESTree.Node): node is TSESTree.FunctionLike {
  return FUNCTION_TYPES.has(node.type);
}

/** Identify the tracked constructor kind, or `null` when the callee is not tracked. */
function ctorKindOf(node: TSESTree.NewExpression, context: Context): ExecutorCtorKind | null {
  if (isCancCtorIdent(node.callee, context)) {
    return 'cancelable';
  }
  if (isLazyCtorIdent(node.callee, context)) {
    return 'lazy';
  }
  return null;
}

function paramName(param: TSESTree.Parameter | undefined): string | undefined {
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

interface ContextInfo {
  contextKind: ExecutorContextKind;
  handleCancelParam: TSESTree.Parameter | undefined;
  handleCancelName: string | undefined;
  getSignalName: string | undefined;
  signalName: string | undefined;
  ctxIdentifierName: string | undefined;
}

function analyzeContextParam(param: TSESTree.Parameter | undefined): ContextInfo {
  if (!param) {
    return {
      contextKind: 'none',
      handleCancelParam: undefined,
      handleCancelName: undefined,
      getSignalName: undefined,
      signalName: undefined,
      ctxIdentifierName: undefined,
    };
  }

  let target: TSESTree.Node = param;
  if (target.type === AST_NODE_TYPES.AssignmentPattern) {
    target = target.left;
  }

  if (target.type === AST_NODE_TYPES.ObjectPattern) {
    let handleCancelName: string | undefined;
    let getSignalName: string | undefined;
    let signalName: string | undefined;
    let handleCancelParamNode: TSESTree.Parameter | undefined;

    for (const prop of target.properties) {
      if (prop.type === AST_NODE_TYPES.Property && prop.key.type === AST_NODE_TYPES.Identifier) {
        let valNode: TSESTree.Node = prop.value;
        if (valNode.type === AST_NODE_TYPES.AssignmentPattern) {
          valNode = valNode.left;
        }
        const boundName = valNode.type === AST_NODE_TYPES.Identifier ? valNode.name : undefined;
        if (prop.key.name === 'handleCancel') {
          handleCancelName = boundName;
          handleCancelParamNode = prop.value as TSESTree.Parameter;
        } else if (prop.key.name === 'getSignal') {
          getSignalName = boundName;
        } else if (prop.key.name === 'signal') {
          signalName = boundName;
        }
      }
    }

    return {
      contextKind: 'destructured',
      handleCancelParam: handleCancelParamNode ?? param,
      handleCancelName,
      getSignalName,
      signalName,
      ctxIdentifierName: undefined,
    };
  }

  if (target.type === AST_NODE_TYPES.Identifier) {
    if (/^_?(handleCancel|hc)$/.test(target.name)) {
      return {
        contextKind: 'legacyFn',
        handleCancelParam: param,
        handleCancelName: target.name,
        getSignalName: undefined,
        signalName: undefined,
        ctxIdentifierName: undefined,
      };
    }
    return {
      contextKind: 'identifier',
      handleCancelParam: undefined,
      handleCancelName: undefined,
      getSignalName: undefined,
      signalName: undefined,
      ctxIdentifierName: target.name,
    };
  }

  return {
    contextKind: 'none',
    handleCancelParam: undefined,
    handleCancelName: undefined,
    getSignalName: undefined,
    signalName: undefined,
    ctxIdentifierName: undefined,
  };
}

/** Second argument as an options object when it carries `signal`/`ref` keys. */
function optionsNode(node: TSESTree.NewExpression): TSESTree.ObjectExpression | undefined {
  if (node.arguments.length < 2) {
    return undefined;
  }
  const arg = node.arguments[1];
  if (arg.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const hasOptionKey = arg.properties.some(
    (prop) =>
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      (prop.key.name === 'signal' || prop.key.name === 'ref'),
  );
  return hasOptionKey ? arg : undefined;
}

/**
 * Walk every node inside `root` (excluding `root` itself), invoking `visit`.
 * `visit` returns whether to descend into the node's children. Boundaries of
 * nested functions are surfaced through the `inNestedFn` flag so a caller can
 * distinguish top-level executor statements from continuation bodies.
 */
function walk(
  root: TSESTree.Node,
  visit: (node: TSESTree.Node, inNestedFn: boolean, parent?: TSESTree.Node) => boolean,
): void {
  const stack: { node: TSESTree.Node; inNestedFn: boolean; parent?: TSESTree.Node }[] = [];
  pushChildren(root, false, stack, root);

  while (stack.length > 0) {
    const { node, inNestedFn, parent } = stack.pop()!;
    const descend = visit(node, inNestedFn, parent);
    if (!descend) {
      continue;
    }
    const childNested = inNestedFn || isFunctionNode(node);
    pushChildren(node, childNested, stack, node);
  }
}

function pushChildren(
  node: TSESTree.Node,
  inNestedFn: boolean,
  stack: { node: TSESTree.Node; inNestedFn: boolean; parent?: TSESTree.Node }[],
  parent: TSESTree.Node,
): void {
  for (const key of Object.keys(node) as (keyof typeof node)[]) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          stack.push({ node: child, inNestedFn, parent });
        }
      }
    } else if (isNode(value)) {
      stack.push({ node: value, inNestedFn, parent });
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function calleeName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : undefined;
}

/** Is `node` a call to the resolve parameter (`resolve(...)`)? */
function isResolveCall(node: TSESTree.Node, resolveName: string | undefined): node is TSESTree.CallExpression {
  return resolveName !== undefined && node.type === AST_NODE_TYPES.CallExpression && calleeName(node) === resolveName;
}

/** Is `node` a call to `handleCancel` (bare or member call on ctx)? */
function isHandleCancelCall(
  node: TSESTree.Node,
  handleCancelName: string | undefined,
  ctxIdentifierName: string | undefined,
): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (handleCancelName !== undefined && calleeName(node) === handleCancelName) {
    return true;
  }
  if (
    ctxIdentifierName !== undefined &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === ctxIdentifierName &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'handleCancel'
  ) {
    return true;
  }
  return false;
}

/** Is `node` a call to `getSignal` (bare or member call on ctx)? */
function isGetSignalCall(
  node: TSESTree.Node,
  getSignalName: string | undefined,
  ctxIdentifierName: string | undefined,
): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (getSignalName !== undefined && calleeName(node) === getSignalName) {
    return true;
  }
  if (
    ctxIdentifierName !== undefined &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === ctxIdentifierName &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'getSignal'
  ) {
    return true;
  }
  return false;
}

/** Is `node` a `<callee>.then(...)` member call? */
function isThenCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'then'
  );
}

/**
 * The call expression a callback returns directly: a concise-body arrow
 * `() => op(...)`, or a block body whose sole statement is `return op(...)`.
 * Used to spot an operation started inside a `.then` callback.
 */
function returnedCall(node: TSESTree.CallExpressionArgument | undefined): TSESTree.CallExpression | undefined {
  if (!node || !isFunctionNode(node)) {
    return undefined;
  }
  const body = node.body;
  if (body.type === AST_NODE_TYPES.CallExpression) {
    return body;
  }
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    for (const stmt of body.body) {
      if (stmt.type === AST_NODE_TYPES.ReturnStatement && stmt.argument?.type === AST_NODE_TYPES.CallExpression) {
        return stmt.argument;
      }
    }
  }
  return undefined;
}

/** Innermost call expression at the head of a `.then()`/`.catch()` chain. */
function chainHeadCall(node: TSESTree.CallExpression): TSESTree.CallExpression | undefined {
  let object: TSESTree.Node = node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : node;
  while (object.type === AST_NODE_TYPES.CallExpression && object.callee.type === AST_NODE_TYPES.MemberExpression) {
    object = object.callee.object;
  }
  return object.type === AST_NODE_TYPES.CallExpression ? object : undefined;
}

/** Casts and non-null assertions do not change the value at runtime. */
export function unwrapTypeOnly(node: TSESTree.Node): TSESTree.Node {
  let curr = node;
  while (
    curr.type === AST_NODE_TYPES.TSAsExpression ||
    curr.type === AST_NODE_TYPES.TSNonNullExpression ||
    curr.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    curr.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    curr = curr.expression;
  }
  return curr;
}

/** A literal, a unary on a literal, or an object/array built only from those: a raw value, not a computation. */
export function isLiteralOnly(node: TSESTree.Node): boolean {
  const inner = unwrapTypeOnly(node);
  switch (inner.type) {
    case AST_NODE_TYPES.Literal:
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return inner.expressions.length === 0;
    case AST_NODE_TYPES.UnaryExpression:
      return inner.operator !== 'delete' && isLiteralOnly(inner.argument);
    case AST_NODE_TYPES.ArrayExpression:
      return inner.elements.every(
        (element) => element === null || (element.type !== AST_NODE_TYPES.SpreadElement && isLiteralOnly(element)),
      );
    case AST_NODE_TYPES.ObjectExpression:
      return inner.properties.every(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property && !prop.computed && prop.kind === 'init' && isLiteralOnly(prop.value),
      );
    default:
      return false;
  }
}

/** A resolve argument counts as a transform when it is anything but a bare identifier or a raw literal value. */
function argIsTransform(arg: TSESTree.CallExpressionArgument | undefined): boolean {
  if (!arg) {
    return false;
  }
  const inner = unwrapTypeOnly(arg);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return false;
  }
  return !isLiteralOnly(inner);
}

/** Set of local names bound to `handleCancel(() => X.abort())` controllers (the `X`). */
function collectAbortControllers(handleCancelCalls: HandleCancelCall[]): Set<string> {
  const controllers = new Set<string>();
  for (const { node } of handleCancelCalls) {
    if (node.arguments.length === 0) {
      continue;
    }
    const arg = node.arguments[0];
    if (!isFunctionNode(arg)) {
      continue;
    }
    walk(arg, (inner) => {
      if (
        inner.type === AST_NODE_TYPES.CallExpression &&
        inner.callee.type === AST_NODE_TYPES.MemberExpression &&
        !inner.callee.computed &&
        inner.callee.property.type === AST_NODE_TYPES.Identifier &&
        inner.callee.property.name === 'abort' &&
        inner.callee.object.type === AST_NODE_TYPES.Identifier
      ) {
        controllers.add(inner.callee.object.name);
      }
      return true;
    });
  }
  return controllers;
}

/**
 * Determine whether any getSignal result, destructured signal or its assigned variable reaches a call argument
 * or an options property in the executor body.
 */
function checkSignalForwarded(
  executor: TSESTree.FunctionLike,
  getSignalCalls: TSESTree.CallExpression[],
  contextInfo?: ContextInfo,
): boolean {
  const getSignalCallSet = new Set<TSESTree.CallExpression>(getSignalCalls);
  const signalVars = new Set<string>();

  if (contextInfo?.signalName) {
    signalVars.add(contextInfo.signalName);
  }

  const isCtxSignalMember = (node: TSESTree.Node): boolean => {
    return (
      Boolean(contextInfo?.ctxIdentifierName) &&
      node.type === AST_NODE_TYPES.MemberExpression &&
      !node.computed &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === contextInfo!.ctxIdentifierName &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'signal'
    );
  };

  // 1. Identify local variables bound to a getSignal() call, destructured signal, or ctx.signal
  walk(executor, (inner) => {
    if (inner.type === AST_NODE_TYPES.VariableDeclarator && inner.id.type === AST_NODE_TYPES.Identifier && inner.init) {
      if (
        (inner.init.type === AST_NODE_TYPES.CallExpression && getSignalCallSet.has(inner.init)) ||
        (inner.init.type === AST_NODE_TYPES.Identifier && signalVars.has(inner.init.name)) ||
        isCtxSignalMember(inner.init)
      ) {
        signalVars.add(inner.id.name);
      }
    }
    if (
      inner.type === AST_NODE_TYPES.AssignmentExpression &&
      inner.left.type === AST_NODE_TYPES.Identifier &&
      inner.right
    ) {
      if (
        (inner.right.type === AST_NODE_TYPES.CallExpression && getSignalCallSet.has(inner.right)) ||
        (inner.right.type === AST_NODE_TYPES.Identifier && signalVars.has(inner.right.name)) ||
        isCtxSignalMember(inner.right)
      ) {
        signalVars.add(inner.left.name);
      }
    }
    return true;
  });

  const isSignalExpr = (node: TSESTree.Node): boolean => {
    if (node.type === AST_NODE_TYPES.CallExpression && getSignalCallSet.has(node)) {
      return true;
    }
    if (node.type === AST_NODE_TYPES.Identifier && signalVars.has(node.name)) {
      return true;
    }
    if (isCtxSignalMember(node)) {
      return true;
    }
    return false;
  };

  // 2. Check if the signal expression reaches a call argument or object property
  let forwarded = false;
  walk(executor, (inner) => {
    if (forwarded) {
      return false;
    }

    // Direct call argument: fn(..., signalExpr, ...)
    if (inner.type === AST_NODE_TYPES.CallExpression && !getSignalCallSet.has(inner)) {
      for (const arg of inner.arguments) {
        if (isSignalExpr(arg)) {
          forwarded = true;
          return false;
        }
      }
    }

    // Property in an object literal: { signal: signalExpr }
    if (inner.type === AST_NODE_TYPES.Property && isSignalExpr(inner.value)) {
      forwarded = true;
      return false;
    }

    return true;
  });

  return forwarded;
}

/**
 * Analyze a `new CancelablePromise(...)` / `new LazyPromise(...)` expression and
 * return its executor shape, or `null` when the callee is not a tracked
 * constructor or the first argument is not a function.
 */
export function analyzeExecutor(node: TSESTree.NewExpression, context: Context): ExecutorShape | null {
  const ctorKind = ctorKindOf(node, context);
  if (ctorKind === null) {
    return null;
  }

  if (node.arguments.length === 0) {
    return null;
  }
  const executorArg = node.arguments[0];
  if (!isFunctionNode(executorArg)) {
    return null;
  }
  const executor = executorArg;

  const rawParam3 = executor.params[2];
  const contextInfo = analyzeContextParam(rawParam3);

  const params: ExecutorParams = {
    resolve: executor.params[0],
    reject: executor.params[1],
    handleCancel: contextInfo.handleCancelParam,
    context: rawParam3,
  };
  const resolveName = paramName(params.resolve);

  const isAsync = executor.async;

  const namedAsyncFns = new Set<string>();
  const nestedFnDecls = new Set<TSESTree.FunctionDeclaration>();
  const invokedFnNames = new Set<string>();

  walk(executor, (inner) => {
    if (inner.type === AST_NODE_TYPES.FunctionDeclaration && inner.id) {
      nestedFnDecls.add(inner);
      if (inner.async) {
        namedAsyncFns.add(inner.id.name);
      }
    }
    if (
      inner.type === AST_NODE_TYPES.VariableDeclarator &&
      inner.id.type === AST_NODE_TYPES.Identifier &&
      inner.init &&
      isFunctionNode(inner.init) &&
      inner.init.async
    ) {
      namedAsyncFns.add(inner.id.name);
    }
    if (
      inner.type === AST_NODE_TYPES.AssignmentExpression &&
      inner.left.type === AST_NODE_TYPES.Identifier &&
      isFunctionNode(inner.right) &&
      inner.right.async
    ) {
      namedAsyncFns.add(inner.left.name);
    }
    if (inner.type === AST_NODE_TYPES.CallExpression) {
      if (inner.callee.type === AST_NODE_TYPES.Identifier) {
        invokedFnNames.add(inner.callee.name);
      }
    }
    return true;
  });

  const uninvokedFnDecls = new Set<TSESTree.FunctionDeclaration>();
  for (const decl of nestedFnDecls) {
    if (!decl.id || !invokedFnNames.has(decl.id.name)) {
      uninvokedFnDecls.add(decl);
    }
  }

  const handleCancelCalls: HandleCancelCall[] = [];
  const getSignalCalls: TSESTree.CallExpression[] = [];
  const asyncDriverCalls: TSESTree.CallExpression[] = [];
  const asyncDriverCallSet = new Set<TSESTree.CallExpression>();
  let returnsValue = false;
  let returnsFunction = false;

  walk(executor, (inner, inNestedFn) => {
    // handleCancel(...) calls
    if (isHandleCancelCall(inner, contextInfo.handleCancelName, contextInfo.ctxIdentifierName)) {
      handleCancelCalls.push({ node: inner, late: inNestedFn });
    }

    // getSignal() calls
    if (isGetSignalCall(inner, contextInfo.getSignalName, contextInfo.ctxIdentifierName)) {
      getSignalCalls.push(inner);
    }

    // async driver: inline async IIFE or named async function call
    if (inner.type === AST_NODE_TYPES.CallExpression) {
      const callee = inner.callee;
      if (
        (isFunctionNode(callee) && callee.async) ||
        (callee.type === AST_NODE_TYPES.Identifier && namedAsyncFns.has(callee.name))
      ) {
        if (!asyncDriverCallSet.has(inner)) {
          asyncDriverCallSet.add(inner);
          asyncDriverCalls.push(inner);
        }
      }
    }

    if (inner.type === AST_NODE_TYPES.ReturnStatement && !inNestedFn && inner.argument) {
      if (isFunctionNode(inner.argument)) {
        returnsFunction = true;
      } else {
        returnsValue = true;
      }
    }

    return true;
  });

  const asyncDriverInside = asyncDriverCalls.length > 0;

  const cleanupCallbacks = new Set<TSESTree.Node>();
  for (const { node: hcNode } of handleCancelCalls) {
    for (const arg of hcNode.arguments) {
      if (isFunctionNode(arg)) {
        cleanupCallbacks.add(arg);
      } else if (arg.type === AST_NODE_TYPES.Identifier) {
        for (const decl of nestedFnDecls) {
          if (decl.id?.name === arg.name) {
            cleanupCallbacks.add(decl);
          }
        }
      }
    }
  }

  const operationStarts: TSESTree.CallExpression[] = [];
  const operationStartSet = new Set<TSESTree.CallExpression>();
  let transformsBeforeResolve = false;

  const addOperation = (call: TSESTree.CallExpression | undefined): void => {
    if (call && !operationStartSet.has(call)) {
      operationStartSet.add(call);
      operationStarts.push(call);
    }
  };

  walk(executor, (inner) => {
    if (cleanupCallbacks.has(inner) || uninvokedFnDecls.has(inner as TSESTree.FunctionDeclaration)) {
      return false;
    }

    if (isThenCall(inner)) {
      addOperation(chainHeadCall(inner));
      for (const cb of inner.arguments) {
        const returned = returnedCall(cb);
        if (returned) {
          addOperation(returned);
        }
      }
    }
    if (inner.type === AST_NODE_TYPES.AwaitExpression && inner.argument.type === AST_NODE_TYPES.CallExpression) {
      addOperation(inner.argument);
    }
    if (isResolveCall(inner, resolveName)) {
      const arg = inner.arguments.length > 0 ? inner.arguments[0] : undefined;
      const innerArg = arg ? unwrapTypeOnly(arg) : undefined;
      if (innerArg?.type === AST_NODE_TYPES.CallExpression) {
        addOperation(innerArg);
      }
      if (
        innerArg?.type === AST_NODE_TYPES.AwaitExpression &&
        innerArg.argument.type === AST_NODE_TYPES.CallExpression
      ) {
        addOperation(innerArg.argument);
      }
      if (argIsTransform(arg)) {
        transformsBeforeResolve = true;
      }
    }

    return true;
  });

  const body = executor.body;
  // concise-body arrow implicitly returns body
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    if (isFunctionNode(body)) {
      returnsFunction = true;
    } else {
      returnsValue = true;
    }
  }

  const controllers = collectAbortControllers(handleCancelCalls);
  const signalReads: (TSESTree.MemberExpression | TSESTree.Identifier)[] = [];
  let controllerForwarded = false;

  if (controllers.size > 0) {
    const destructuredSignalBindings = new Map<string, Set<TSESTree.Node>>();

    walk(executor, (inner) => {
      if (
        inner.type === AST_NODE_TYPES.VariableDeclarator &&
        inner.id.type === AST_NODE_TYPES.ObjectPattern &&
        inner.init?.type === AST_NODE_TYPES.Identifier &&
        controllers.has(inner.init.name)
      ) {
        for (const prop of inner.id.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            !prop.computed &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.key.name === 'signal'
          ) {
            let valNode: TSESTree.Node = prop.value;
            if (valNode.type === AST_NODE_TYPES.AssignmentPattern) {
              valNode = valNode.left;
            }
            if (valNode.type === AST_NODE_TYPES.Identifier) {
              let set = destructuredSignalBindings.get(valNode.name);
              if (!set) {
                set = new Set();
                destructuredSignalBindings.set(valNode.name, set);
              }
              set.add(valNode);
            }
          }
        }
      }
      if (
        inner.type === AST_NODE_TYPES.AssignmentExpression &&
        inner.left.type === AST_NODE_TYPES.ObjectPattern &&
        inner.right.type === AST_NODE_TYPES.Identifier &&
        controllers.has(inner.right.name)
      ) {
        for (const prop of inner.left.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            !prop.computed &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.key.name === 'signal'
          ) {
            let valNode: TSESTree.Node = prop.value;
            if (valNode.type === AST_NODE_TYPES.AssignmentPattern) {
              valNode = valNode.left;
            }
            if (valNode.type === AST_NODE_TYPES.Identifier) {
              let set = destructuredSignalBindings.get(valNode.name);
              if (!set) {
                set = new Set();
                destructuredSignalBindings.set(valNode.name, set);
              }
              set.add(valNode);
            }
          }
        }
      }
      return true;
    });

    const handleCancelCallSet = new Set<TSESTree.CallExpression>(handleCancelCalls.map((c) => c.node));

    walk(executor, (inner, _inNestedFn, parent) => {
      if (cleanupCallbacks.has(inner)) {
        return false;
      }

      // controller.signal member read
      if (
        inner.type === AST_NODE_TYPES.MemberExpression &&
        !inner.computed &&
        inner.object.type === AST_NODE_TYPES.Identifier &&
        controllers.has(inner.object.name) &&
        inner.property.type === AST_NODE_TYPES.Identifier &&
        inner.property.name === 'signal'
      ) {
        signalReads.push(inner);
      }

      // destructured signal variable reference
      if (inner.type === AST_NODE_TYPES.Identifier && destructuredSignalBindings.has(inner.name)) {
        const defNodes = destructuredSignalBindings.get(inner.name)!;
        if (!defNodes.has(inner)) {
          const isMemberProp =
            parent?.type === AST_NODE_TYPES.MemberExpression && parent.property === inner && !parent.computed;
          const isPropKey = parent?.type === AST_NODE_TYPES.Property && parent.key === inner;
          if (!isMemberProp && !isPropKey) {
            signalReads.push(inner);
          }
        }
      }

      // whole-controller forwarding: fn(..., controller, ...)
      if (inner.type === AST_NODE_TYPES.CallExpression && !handleCancelCallSet.has(inner)) {
        for (const arg of inner.arguments) {
          if (arg.type === AST_NODE_TYPES.Identifier && controllers.has(arg.name)) {
            controllerForwarded = true;
          }
        }
      }

      return true;
    });
  }

  const signalForwarded = checkSignalForwarded(executor, getSignalCalls, contextInfo);

  return {
    ctorKind,
    executor,
    params,
    contextKind: contextInfo.contextKind,
    isAsync,
    asyncDriverInside,
    asyncDriverCalls,
    operationStarts,
    transformsBeforeResolve,
    handleCancelCalls,
    getSignalCalls,
    signalForwarded,
    controllerForwarded,
    signalReads,
    returnsValue,
    returnsFunction,
    ctorOptionsNode: optionsNode(node),
  };
}
