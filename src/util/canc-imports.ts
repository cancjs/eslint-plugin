import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancSettings } from './settings.js';

/**
 * A binding imported from a canc source, keyed by its local name.
 *
 * `exported` is the name as exported by the source module (`'default'` for a
 * default import, `'*'` for a namespace import), independent of any local
 * rename. `source` is the module specifier the binding came from.
 */
export interface CancBinding {
  source: string;
  /** Export name on the source module: real name, `'default'`, or `'*'`. */
  exported: string;
  /** True when the local name is a namespace object (`import * as canc`). */
  namespace: boolean;
}

type Context = TSESLint.RuleContext<string, unknown[]>;

const bindingCache = new WeakMap<object, Map<string, CancBinding>>();

/**
 * Build (once per file) a map of local identifier name to the canc binding it
 * refers to, for every ESM import and `require()` whose source is a configured
 * canc package.
 *
 * Handles named, renamed, default and namespace ESM imports, plus the two
 * common CommonJS forms: `const { x } = require('...')` and
 * `const ns = require('...')`. Re-assignments are not tracked (v1).
 */
export function getCancBindings(context: Context): Map<string, CancBinding> {
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  const cached = bindingCache.get(program);
  if (cached) {
    return cached;
  }

  const sources = new Set(getCancSettings(context).sources);
  const bindings = new Map<string, CancBinding>();

  for (const statement of program.body) {
    collectFromStatement(statement, sources, bindings);
  }

  bindingCache.set(program, bindings);
  return bindings;
}

function collectFromStatement(
  statement: TSESTree.ProgramStatement,
  sources: Set<string>,
  bindings: Map<string, CancBinding>,
): void {
  if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
    collectFromImport(statement, sources, bindings);
    return;
  }

  if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const declarator of statement.declarations) {
      collectFromRequire(declarator, sources, bindings);
    }
  }
}

function collectFromImport(
  node: TSESTree.ImportDeclaration,
  sources: Set<string>,
  bindings: Map<string, CancBinding>,
): void {
  // Type-only imports carry no runtime binding to track.
  if (node.importKind === 'type') {
    return;
  }
  const source = node.source.value;
  if (!sources.has(source)) {
    return;
  }

  for (const specifier of node.specifiers) {
    switch (specifier.type) {
      case AST_NODE_TYPES.ImportSpecifier: {
        if (specifier.importKind === 'type') {
          break;
        }
        const exported =
          specifier.imported.type === AST_NODE_TYPES.Identifier ?
            specifier.imported.name
          : String(specifier.imported.value);
        bindings.set(specifier.local.name, { source, exported, namespace: false });
        break;
      }
      case AST_NODE_TYPES.ImportDefaultSpecifier:
        bindings.set(specifier.local.name, { source, exported: 'default', namespace: false });
        break;
      case AST_NODE_TYPES.ImportNamespaceSpecifier:
        bindings.set(specifier.local.name, { source, exported: '*', namespace: true });
        break;
    }
  }
}

function collectFromRequire(
  declarator: TSESTree.VariableDeclarator,
  sources: Set<string>,
  bindings: Map<string, CancBinding>,
): void {
  const init = declarator.init;
  if (!init) {
    return;
  }
  const source = requireSource(init);
  if (source === undefined || !sources.has(source)) {
    return;
  }

  const id = declarator.id;

  if (id.type === AST_NODE_TYPES.Identifier) {
    bindings.set(id.name, { source, exported: '*', namespace: true });
    return;
  }

  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    for (const property of id.properties) {
      if (
        property.type !== AST_NODE_TYPES.Property ||
        property.key.type !== AST_NODE_TYPES.Identifier ||
        property.value.type !== AST_NODE_TYPES.Identifier
      ) {
        continue;
      }
      bindings.set(property.value.name, {
        source,
        exported: property.key.name,
        namespace: false,
      });
    }
  }
}

function requireSource(node: TSESTree.Expression): string | undefined {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require' &&
    node.arguments.length === 1
  ) {
    const arg = node.arguments[0];
    if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === 'string') {
      return arg.value;
    }
  }
  return undefined;
}

/**
 * Resolve an identifier to its canc binding, honoring lexical scope: a local
 * redeclaration that shadows an imported name wins (returns undefined). Returns
 * the binding only when the identifier at this position actually references the
 * imported binding.
 */
function resolveBinding(node: TSESTree.Identifier, context: Context): CancBinding | undefined {
  const bindings = getCancBindings(context);
  const binding = bindings.get(node.name);
  if (!binding) {
    return undefined;
  }

  const variable = findVariable(node, context);
  if (!variable) {
    // fall back to name binding when identifier lacks a resolvable variable
    return binding;
  }

  const sources = new Set(getCancSettings(context).sources);
  const fromTrackedDecl = variable.defs.some((def) => {
    if (
      def.node.type === AST_NODE_TYPES.ImportSpecifier ||
      def.node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
      def.node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
    ) {
      return true;
    }
    if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
      const src = requireSource(def.node.init);
      return src !== undefined && sources.has(src);
    }
    return false;
  });

  return fromTrackedDecl ? binding : undefined;
}

function findVariable(node: TSESTree.Identifier, context: Context): TSESLint.Scope.Variable | undefined {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.variables.find((v) => v.name === node.name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
  return undefined;
}

function canonMatches(binding: CancBinding, exported: string): boolean {
  if (binding.exported === 'default') {
    return exported === 'CancelablePromise' && binding.source === '@cancjs/promise';
  }
  if (binding.exported === exported) {
    return true;
  }
  // Short export aliases in @cancjs/coroutine
  if (binding.source === '@cancjs/coroutine') {
    if (exported === 'cancAsync' && binding.exported === 'async') return true;
    if (exported === 'cancAwait' && binding.exported === 'await') return true;
    if (exported === 'cancForAwait' && binding.exported === 'forAwait') return true;
    if (exported === 'cancThrow' && binding.exported === 'throw') return true;
  }
  // Short export aliases in @cancjs/coroutine/gen
  if (binding.source === '@cancjs/coroutine/gen') {
    if (exported === 'cancGenAsync' && binding.exported === 'async') return true;
    if (exported === 'cancGenAwait' && binding.exported === 'await') return true;
    if (exported === 'cancGenForAwait' && binding.exported === 'forAwait') return true;
    if (exported === 'cancGenDelegate' && binding.exported === 'delegate') return true;
    if (exported === 'cancGenThrow' && binding.exported === 'throw') return true;
  }
  return false;
}

/** Does this identifier reference a given exported name from a canc source? */
function bindingMatches(node: TSESTree.Node | null | undefined, context: Context, exported: string): boolean {
  if (node?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const binding = resolveBinding(node, context);
  if (binding === undefined || binding.namespace) {
    return false;
  }
  return canonMatches(binding, exported);
}

/**
 * Does this identifier reference a namespace member of a canc source, i.e.
 * `ns.<member>` where `ns` is a tracked namespace import? Returns true when matched.
 */
function namespaceMemberMatches(node: TSESTree.Node | null | undefined, context: Context, member: string): boolean {
  if (node?.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  if (node.object.type !== AST_NODE_TYPES.Identifier || node.property.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const binding = resolveBinding(node.object, context);
  if (!binding?.namespace) {
    return false;
  }
  const propName = node.property.name;
  if (propName === member) {
    return true;
  }
  if (binding.source === '@cancjs/coroutine') {
    if (member === 'cancAsync' && propName === 'async') return true;
    if (member === 'cancAwait' && propName === 'await') return true;
    if (member === 'cancForAwait' && propName === 'forAwait') return true;
    if (member === 'cancThrow' && propName === 'throw') return true;
  }
  if (binding.source === '@cancjs/coroutine/gen') {
    if (member === 'cancGenAsync' && propName === 'async') return true;
    if (member === 'cancGenAwait' && propName === 'await') return true;
    if (member === 'cancGenForAwait' && propName === 'forAwait') return true;
    if (member === 'cancGenDelegate' && propName === 'delegate') return true;
    if (member === 'cancGenThrow' && propName === 'throw') return true;
  }
  return false;
}

/**
 * True when `node` refers to `exported` either as a direct named/default import
 * binding or as a namespace-member access (`ns.exported`). Accepts the marker
 * expression node itself (an Identifier for named forms, a MemberExpression for
 * namespace forms).
 */
export function refersTo(node: TSESTree.Node | null | undefined, context: Context, exported: string): boolean {
  return bindingMatches(node, context, exported) || namespaceMemberMatches(node, context, exported);
}

/** Is `node` a reference to the CancelablePromise constructor? */
export function isCancCtorIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  return refersTo(node, context, 'CancelablePromise');
}

/** Is `node` a reference to the LazyPromise constructor? */
export function isLazyCtorIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  const names = getCancSettings(context).lazyTypeNames;
  return names.some((name) => refersTo(node, context, name));
}

export type CoroutineFn = 'cancAsync' | 'cancGenAsync';

/** Is `node` a reference to the given coroutine driver function? */
export function isCoroutineFnIdent(
  node: TSESTree.Node | null | undefined,
  context: Context,
  which: CoroutineFn,
): boolean {
  return refersTo(node, context, which);
}

/** Is `node` a reference to the `cancAwait` step marker (canc dialect)? */
export function isCancAwaitIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  return refersTo(node, context, 'cancAwait');
}

/** Is `node` a reference to the `cancGenAwait` step marker (gen dialect)? */
export function isCancGenAwaitIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  return refersTo(node, context, 'cancGenAwait');
}

/** Is `node` a reference to the `withFailure` helper? */
export function isWithFailureIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  return refersTo(node, context, 'withFailure');
}

const HELPER_NAMES = new Set([
  // coroutine stream, throw and failure helpers
  'cancForAwait',
  'cancGenForAwait',
  'cancGenDelegate',
  'cancThrow',
  'cancGenThrow',
  'IterationError',
  'withFailure',
  'BreakError',
  'isBreakError',
  'asyncMethod',
  'bindMethod',
  'catchErrors',
  'suppressErrors',
  'createIsError',
  'isErrorOf',
  // promise error, boundary and signal exports
  'CancelError',
  'isCancelError',
  'isCancPromise',
  'AbortError',
  'isAbortError',
  'TimeoutError',
  'isTimeoutError',
  'AggregateError',
  'isAggregateError',
  'catchCancel',
  'suppressCancel',
  'catchAbort',
  'suppressAbort',
  'catchTimeout',
  'suppressTimeout',
  'createCatchError',
  'createSuppressError',
  'makeCancelable',
  'createCancelSignal',
  'isCancelSignal',
  // toolbox lazy, wrapper and utility exports
  'lazy',
  'createLazyPromise',
  'isLazyPromise',
  'cancelify',
  'promisify',
  'promisifyAll',
  'createAbortSignal',
  'toAbortSignal',
  'withSignal',
  'SupersededError',
  'isSupersededError',
  'defer',
  'delay',
  'fromAbortSignal',
  'limit',
  'map',
  'minDelay',
  'retry',
  'timeout',
  'waitFor',
  'debounce',
  'throttle',
]);

/**
 * Is `node` a reference to a named canc helper? Covers coroutine stream/throw/failure
 * helpers and toolbox wrappers.
 */
export function isHelperIdent(node: TSESTree.Node | null | undefined, context: Context, name: string): boolean {
  if (!HELPER_NAMES.has(name)) {
    return false;
  }
  return refersTo(node, context, name);
}

/**
 * Is `node` a call expression to a throw helper (`cancThrow`, `canc.throw`, `cancGenThrow`, `cancGen.throw`)?
 * Rename and shadowing aware. Returns `{ dialect: 'canc' | 'cancGen' }` or `null`.
 */
export function isThrowHelperCall(
  node: TSESTree.Node | null | undefined,
  context: Context,
): { dialect: 'canc' | 'cancGen' } | null {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return null;
  }
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const binding = resolveBinding(callee, context);
    if (binding && !binding.namespace) {
      if (binding.exported === 'cancGenThrow') {
        return { dialect: 'cancGen' };
      }
      if (binding.exported === 'cancThrow') {
        return { dialect: 'canc' };
      }
      if (binding.exported === 'throw') {
        if (binding.source === '@cancjs/coroutine/gen') {
          return { dialect: 'cancGen' };
        }
        if (binding.source === '@cancjs/coroutine') {
          return { dialect: 'canc' };
        }
      }
    }
  } else if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const binding = resolveBinding(callee.object, context);
    if (binding?.namespace) {
      const propName = callee.property.name;
      if (binding.source === '@cancjs/coroutine/gen' && (propName === 'throw' || propName === 'cancGenThrow')) {
        return { dialect: 'cancGen' };
      }
      if (binding.source === '@cancjs/coroutine' && (propName === 'throw' || propName === 'cancThrow')) {
        return { dialect: 'canc' };
      }
    }
  }
  return null;
}

/**
 * Does `node` reference `cancForAwait.next` on a tracked `cancForAwait` binding?
 */
export function isCancForAwaitNext(node: TSESTree.Node | null | undefined, context: Context): boolean {
  if (
    node?.type !== AST_NODE_TYPES.MemberExpression ||
    node.computed ||
    node.property.type !== AST_NODE_TYPES.Identifier ||
    node.property.name !== 'next'
  ) {
    return false;
  }
  return isHelperIdent(node.object, context, 'cancForAwait') || isHelperIdent(node.object, context, 'cancGenForAwait');
}
