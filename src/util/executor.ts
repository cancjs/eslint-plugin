import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { isCancCtorIdent, isLazyCtorIdent } from './canc-imports.js';

type Context = TSESLint.RuleContext<string, unknown[]>;

/** Which tracked constructor a `new` expression targets. */
export type ExecutorCtorKind = 'cancelable' | 'lazy';

/** Executor parameter roles, resolved positionally (resolve, reject, handleCancel). */
export interface ExecutorParams {
  resolve: TSESTree.Parameter | undefined;
  reject: TSESTree.Parameter | undefined;
  /** Third positional parameter. Only meaningful for cancelable executors. */
  handleCancel: TSESTree.Parameter | undefined;
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
  /** Executor is declared `async`. */
  isAsync: boolean;
  /**
   * An async IIFE or a call to a named async function drives the body (the
   * async-wrapper evasion of a synchronous executor).
   */
  asyncDriverInside: boolean;
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
  /**
   * Reads of `<id>.signal` where `<id>` is an object whose `.abort()` is wired
   * through `handleCancel`. Empty means an abort controller is wired but its
   * signal is never forwarded.
   */
  signalReads: TSESTree.MemberExpression[];
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
  return param?.type === AST_NODE_TYPES.Identifier ? param.name : undefined;
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
function walk(root: TSESTree.Node, visit: (node: TSESTree.Node, inNestedFn: boolean) => boolean): void {
  const stack: { node: TSESTree.Node; inNestedFn: boolean }[] = [];
  pushChildren(root, false, stack);

  while (stack.length > 0) {
    const { node, inNestedFn } = stack.pop()!;
    const descend = visit(node, inNestedFn);
    if (!descend) {
      continue;
    }
    const childNested = inNestedFn || isFunctionNode(node);
    pushChildren(node, childNested, stack);
  }
}

function pushChildren(
  node: TSESTree.Node,
  inNestedFn: boolean,
  stack: { node: TSESTree.Node; inNestedFn: boolean }[],
): void {
  for (const key of Object.keys(node) as (keyof typeof node)[]) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          stack.push({ node: child, inNestedFn });
        }
      }
    } else if (isNode(value)) {
      stack.push({ node: value, inNestedFn });
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function calleeName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : undefined;
}

/** Is `expr` a call to the resolve parameter (`resolve(...)`)? */
function isResolveCall(node: TSESTree.Node, resolveName: string | undefined): node is TSESTree.CallExpression {
  return resolveName !== undefined && node.type === AST_NODE_TYPES.CallExpression && calleeName(node) === resolveName;
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

/** A resolve argument counts as a transform when it is anything but a bare identifier/literal. */
function argIsTransform(arg: TSESTree.CallExpressionArgument | undefined): boolean {
  if (!arg) {
    return false;
  }
  switch (arg.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
      return false;
    default:
      return true;
  }
}

/** Set of local names bound to `handleCancel(() => X.abort())` controllers (the `X`). */
function collectAbortControllers(
  handleCancelCalls: HandleCancelCall[],
  handleCancelName: string | undefined,
): Set<string> {
  const controllers = new Set<string>();
  if (handleCancelName === undefined) {
    return controllers;
  }
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

  const params: ExecutorParams = {
    resolve: executor.params[0],
    reject: executor.params[1],
    handleCancel: executor.params[2],
  };
  const resolveName = paramName(params.resolve);
  const handleCancelName = paramName(params.handleCancel);

  const isAsync = executor.async;

  const handleCancelCalls: HandleCancelCall[] = [];
  const operationStarts: TSESTree.CallExpression[] = [];
  const operationStartSet = new Set<TSESTree.CallExpression>();
  let asyncDriverInside = false;
  let transformsBeforeResolve = false;
  let returnsValue = false;
  let returnsFunction = false;

  const body = executor.body;

  const addOperation = (call: TSESTree.CallExpression | undefined): void => {
    if (call && !operationStartSet.has(call)) {
      operationStartSet.add(call);
      operationStarts.push(call);
    }
  };

  walk(executor, (inner, inNestedFn) => {
    // handleCancel(...) calls
    if (isResolveCall(inner, handleCancelName)) {
      handleCancelCalls.push({ node: inner, late: inNestedFn });
    }

    // async driver: (async () => {...})() or a named async fn invoked
    if (inner.type === AST_NODE_TYPES.CallExpression) {
      const callee = inner.callee;
      if (isFunctionNode(callee) && callee.async) {
        asyncDriverInside = true;
      }
    }

    // operation starts: X(...).then(...) chain head, or a call whose result is passed to resolve
    if (isThenCall(inner)) {
      addOperation(chainHeadCall(inner));
      // A thenable-producing call returned from a `.then` callback is itself a
      // distinct operation started inside the executor (the monolithic-executor
      // signal): `.then(() => chargeCard(...))`.
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
      if (arg?.type === AST_NODE_TYPES.CallExpression) {
        addOperation(arg);
      }
      if (arg?.type === AST_NODE_TYPES.AwaitExpression && arg.argument.type === AST_NODE_TYPES.CallExpression) {
        addOperation(arg.argument);
      }
      if (argIsTransform(arg)) {
        transformsBeforeResolve = true;
      }
    }

    // return handling: only returns that belong to the executor itself (not nested fns)
    if (inner.type === AST_NODE_TYPES.ReturnStatement && !inNestedFn && inner.argument) {
      if (isFunctionNode(inner.argument)) {
        returnsFunction = true;
      } else {
        returnsValue = true;
      }
    }

    return true;
  });

  // Concise-body arrow: `(...) => expr` implicitly returns `expr`.
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    if (isFunctionNode(body)) {
      returnsFunction = true;
    } else {
      returnsValue = true;
    }
  }

  // signal reads of controllers wired through handleCancel abort
  const controllers = collectAbortControllers(handleCancelCalls, handleCancelName);
  const signalReads: TSESTree.MemberExpression[] = [];
  if (controllers.size > 0) {
    walk(executor, (inner) => {
      if (
        inner.type === AST_NODE_TYPES.MemberExpression &&
        !inner.computed &&
        inner.object.type === AST_NODE_TYPES.Identifier &&
        controllers.has(inner.object.name) &&
        inner.property.type === AST_NODE_TYPES.Identifier &&
        inner.property.name === 'signal'
      ) {
        // Exclude the `.signal` that sits inside the handleCancel abort callback itself
        // (there is none in practice, abort() reads no signal), so every hit is a forward.
        signalReads.push(inner);
      }
      return true;
    });
  }

  return {
    ctorKind,
    executor,
    params,
    isAsync,
    asyncDriverInside,
    operationStarts,
    transformsBeforeResolve,
    handleCancelCalls,
    signalReads,
    returnsValue,
    returnsFunction,
    ctorOptionsNode: optionsNode(node),
  };
}
