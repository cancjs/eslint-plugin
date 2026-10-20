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

  // const ns = require('...')
  if (id.type === AST_NODE_TYPES.Identifier) {
    bindings.set(id.name, { source, exported: '*', namespace: true });
    return;
  }

  // const { x, y: z } = require('...')
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
    // No resolvable variable (e.g. the identifier is a property key). Fall back
    // to the name-based binding; callers gate property/member positions.
    return binding;
  }

  const fromTrackedDecl = variable.defs.some(
    (def) =>
      // ESM import specifier
      def.node.type === AST_NODE_TYPES.ImportSpecifier ||
      def.node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
      def.node.type === AST_NODE_TYPES.ImportNamespaceSpecifier ||
      // require() destructure / namespace binding
      def.node.type === AST_NODE_TYPES.VariableDeclarator,
  );

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

/** Does this identifier reference a given exported name from a canc source? */
function bindingMatches(node: TSESTree.Node | null | undefined, context: Context, exported: string): boolean {
  if (node?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const binding = resolveBinding(node, context);
  if (binding === undefined || binding.namespace) {
    return false;
  }
  // A default import binds an arbitrary local name to the module's default
  // export; the source module (not the local name) determines identity. canc
  // packages expose named exports, so a default binding is treated as matching
  // whatever marker is being queried against its source.
  return binding.exported === 'default' || binding.exported === exported;
}

/**
 * Does this identifier reference a namespace member of a canc source, i.e.
 * `ns.<member>` where `ns` is a tracked namespace import? Returns the source of
 * the namespace when matched.
 */
function namespaceMemberMatches(node: TSESTree.Node | null | undefined, context: Context, member: string): boolean {
  if (node?.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  if (
    node.object.type !== AST_NODE_TYPES.Identifier ||
    node.property.type !== AST_NODE_TYPES.Identifier ||
    node.property.name !== member
  ) {
    return false;
  }
  const binding = resolveBinding(node.object, context);
  return binding?.namespace === true;
}

/**
 * True when `node` refers to `exported` either as a direct named/default import
 * binding or as a namespace-member access (`ns.exported`). Accepts the marker
 * expression node itself (an Identifier for named forms, a MemberExpression for
 * namespace forms).
 */
function refersTo(node: TSESTree.Node | null | undefined, context: Context, exported: string): boolean {
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

export type CoroutineFn = 'cancAsync' | 'cancIterAsync';

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

/** Is `node` a reference to the `cancIterAwait` step marker (iter dialect)? */
export function isCancIterAwaitIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  return refersTo(node, context, 'cancIterAwait');
}

/** Is `node` a reference to the raw `awaited` iter marker? */
export function isAwaitedIdent(node: TSESTree.Node | null | undefined, context: Context): boolean {
  return refersTo(node, context, 'awaited');
}

const HELPER_NAMES = new Set([
  // coroutine stream helpers
  'cancForAwait',
  'cancIterForAwait',
  'cancIterDelegate',
  // toolbox wrappers
  'cancelify',
  'promisify',
  'promisifyAll',
  'createAbortSignal',
]);

/**
 * Is `node` a reference to a named canc helper? Covers the coroutine stream
 * helpers (cancForAwait / cancIterForAwait / cancIterDelegate) and the toolbox
 * wrappers (cancelify / promisify / promisifyAll / createAbortSignal).
 */
export function isHelperIdent(node: TSESTree.Node | null | undefined, context: Context, name: string): boolean {
  if (!HELPER_NAMES.has(name)) {
    return false;
  }
  return refersTo(node, context, name);
}
