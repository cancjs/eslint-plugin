import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { calleeDialect, type ResolvedFactories, resolveFactories } from './coroutine-factories.js';
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
  /** True when imported with `import type` or `import { type X }`. */
  isTypeOnly?: boolean;
}

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

const bindingCache = new WeakMap<object, Map<string, CancBinding>>();
const valueBindingCache = new WeakMap<object, Map<string, CancBinding>>();

export interface CancBindingOptions {
  /** Keep bindings imported with `import type` or `import { type X }`. Default false. */
  includeTypeOnly?: boolean;
}

/**
 * Build (once per file) a map of local identifier name to the canc binding it
 * refers to, for every ESM import and `require()` whose source is a configured
 * canc package.
 *
 * Handles named, renamed, default and namespace ESM imports, plus the two
 * common CommonJS forms: `const { x } = require('...')` and
 * `const ns = require('...')`. Re-assignments are not tracked (v1).
 *
 * Type-only imports have no runtime binding, so they are left out unless
 * `includeTypeOnly` is set.
 */
export function getCancBindings(context: Context, options: CancBindingOptions = {}): Map<string, CancBinding> {
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  let all = bindingCache.get(program);
  if (!all) {
    const sources = new Set(getCancSettings(context).sources);
    all = new Map<string, CancBinding>();
    for (const statement of program.body) {
      collectFromStatement(statement, sources, all);
    }
    bindingCache.set(program, all);
  }
  if (options.includeTypeOnly) {
    return all;
  }

  let valueOnly = valueBindingCache.get(program);
  if (!valueOnly) {
    valueOnly = new Map([...all].filter(([, binding]) => !binding.isTypeOnly));
    valueBindingCache.set(program, valueOnly);
  }
  return valueOnly;
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
  const source = node.source.value;
  if (!sources.has(source)) {
    return;
  }

  const isTypeDecl = node.importKind === 'type';
  for (const specifier of node.specifiers) {
    const isTypeOnly =
      isTypeDecl || (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind === 'type');
    const extra = isTypeOnly ? { isTypeOnly: true as const } : {};
    switch (specifier.type) {
      case AST_NODE_TYPES.ImportSpecifier: {
        const exported =
          specifier.imported.type === AST_NODE_TYPES.Identifier ?
            specifier.imported.name
          : String(specifier.imported.value);
        bindings.set(specifier.local.name, { source, exported, namespace: false, ...extra });
        break;
      }
      case AST_NODE_TYPES.ImportDefaultSpecifier:
        bindings.set(specifier.local.name, { source, exported: 'default', namespace: false, ...extra });
        break;
      case AST_NODE_TYPES.ImportNamespaceSpecifier:
        bindings.set(specifier.local.name, { source, exported: '*', namespace: true, ...extra });
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

export interface CoroutineContext {
  kind: 'cancAsync' | 'cancGenAsync';
  genFn: TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
  call: TSESTree.CallExpression | null; // null for a delegated helper generator
  options: TSESTree.ObjectExpression | null; // cancAsync 3rd arg, cancGenAsync 2nd arg, object literal only
  delegated: boolean;
}

// keyed by Program, then by the resolved factory bag a rule passes in
const coroutineContextCache = new WeakMap<object, WeakMap<ResolvedFactories, Map<TSESTree.Node, CoroutineContext>>>();

function unwrapParens(node: TSESTree.Node): TSESTree.Node {
  let curr = node;
  while (
    curr.type === AST_NODE_TYPES.TSAsExpression ||
    curr.type === AST_NODE_TYPES.TSTypeAssertion ||
    curr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    curr = curr.expression;
  }
  return curr;
}

function resolveGeneratorFnFromIdentifier(
  node: TSESTree.Identifier,
  context: Context,
): TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | null {
  const variable = findVariable(node, context);
  if (!variable || variable.defs.length === 0) {
    return null;
  }
  for (const def of variable.defs) {
    if (def.node.type === AST_NODE_TYPES.FunctionDeclaration && def.node.generator && !def.node.async) {
      return def.node;
    }
    if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
      const init = unwrapParens(def.node.init);
      if (
        (init.type === AST_NODE_TYPES.FunctionExpression || init.type === AST_NODE_TYPES.FunctionDeclaration) &&
        init.generator &&
        !init.async
      ) {
        return init;
      }
    }
  }
  return null;
}

function getCoroutineFileMap(context: Context, factories: ResolvedFactories): Map<TSESTree.Node, CoroutineContext> {
  const program = context.sourceCode.ast;
  let byFactories = coroutineContextCache.get(program);
  if (!byFactories) {
    byFactories = new WeakMap();
    coroutineContextCache.set(program, byFactories);
  }
  const cached = byFactories.get(factories);
  if (cached) {
    return cached;
  }

  const map = new Map<TSESTree.Node, CoroutineContext>();
  byFactories.set(factories, map);

  interface Candidate {
    kind: 'cancAsync' | 'cancGenAsync';
    call: TSESTree.CallExpression;
    options: TSESTree.ObjectExpression | null;
  }
  const rootCandidates = new Map<TSESTree.FunctionDeclaration | TSESTree.FunctionExpression, Candidate[]>();

  function registerRoot(
    fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression,
    kind: 'cancAsync' | 'cancGenAsync',
    call: TSESTree.CallExpression,
    options: TSESTree.ObjectExpression | null,
  ): void {
    const list = rootCandidates.get(fn) ?? [];
    list.push({ kind, call, options });
    rootCandidates.set(fn, list);
  }

  function walkAST(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const kind = calleeDialect(node.callee, context, factories);

      if (kind) {
        let options: TSESTree.ObjectExpression | null = null;
        // option positions are known for the built-in drivers only
        const builtIn = isCoroutineFnIdent(node.callee, context, kind);
        if (builtIn && kind === 'cancAsync') {
          if (node.arguments[2]?.type === AST_NODE_TYPES.ObjectExpression) {
            options = node.arguments[2];
          }
        } else if (builtIn) {
          if (node.arguments[1]?.type === AST_NODE_TYPES.ObjectExpression) {
            options = node.arguments[1];
          }
        }

        const arg0 = node.arguments[0];
        if (arg0) {
          const unwrapped = unwrapParens(arg0);
          if (
            (unwrapped.type === AST_NODE_TYPES.FunctionExpression ||
              unwrapped.type === AST_NODE_TYPES.FunctionDeclaration) &&
            unwrapped.generator &&
            !unwrapped.async
          ) {
            registerRoot(unwrapped, kind, node, options);
          } else if (unwrapped.type === AST_NODE_TYPES.Identifier) {
            const genFn = resolveGeneratorFnFromIdentifier(unwrapped, context);
            if (genFn) {
              registerRoot(genFn, kind, node, options);
            }
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              walkAST(item as TSESTree.Node);
            }
          }
        } else if ('type' in child) {
          walkAST(child as TSESTree.Node);
        }
      }
    }
  }

  walkAST(program);

  for (const [fn, candidates] of rootCandidates) {
    const kinds = new Set(candidates.map((c) => c.kind));
    if (kinds.size === 1) {
      const first = candidates[0];
      map.set(fn, {
        kind: first.kind,
        genFn: fn,
        call: first.call,
        options: first.options,
        delegated: false,
      });
    }
  }

  function collectYieldDelegates(
    fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression,
  ): (TSESTree.FunctionDeclaration | TSESTree.FunctionExpression)[] {
    const delegates: (TSESTree.FunctionDeclaration | TSESTree.FunctionExpression)[] = [];
    function scan(node: TSESTree.Node): void {
      if (
        node !== fn &&
        (node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return;
      }
      if (node.type === AST_NODE_TYPES.YieldExpression && node.delegate && node.argument) {
        const unwrapped = unwrapParens(node.argument);
        if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
          const callee = unwrapParens(unwrapped.callee);
          if (callee.type === AST_NODE_TYPES.Identifier) {
            const target = resolveGeneratorFnFromIdentifier(callee, context);
            if (target && target !== fn) {
              delegates.push(target);
            }
          } else if (
            (callee.type === AST_NODE_TYPES.FunctionExpression || callee.type === AST_NODE_TYPES.FunctionDeclaration) &&
            callee.generator &&
            callee !== fn
          ) {
            delegates.push(callee);
          }
        } else if (unwrapped.type === AST_NODE_TYPES.Identifier) {
          const target = resolveGeneratorFnFromIdentifier(unwrapped, context);
          if (target && target !== fn) {
            delegates.push(target);
          }
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                scan(item as TSESTree.Node);
              }
            }
          } else if ('type' in child) {
            scan(child as TSESTree.Node);
          }
        }
      }
    }
    if (fn.body) {
      scan(fn.body);
    }
    return delegates;
  }

  const reachableDialects = new Map<
    TSESTree.FunctionDeclaration | TSESTree.FunctionExpression,
    Set<'cancAsync' | 'cancGenAsync'>
  >();

  for (const [rootFn, rootCtx] of Array.from(map.entries())) {
    const visited = new Set<TSESTree.Node>([rootFn]);
    const queue: (TSESTree.FunctionDeclaration | TSESTree.FunctionExpression)[] = [
      rootFn as TSESTree.FunctionDeclaration | TSESTree.FunctionExpression,
    ];

    while (queue.length > 0) {
      const currentFn = queue.shift()!;
      const targets = collectYieldDelegates(currentFn);
      for (const target of targets) {
        if (rootCandidates.has(target)) {
          continue;
        }
        let dialects = reachableDialects.get(target);
        if (!dialects) {
          dialects = new Set();
          reachableDialects.set(target, dialects);
        }
        dialects.add(rootCtx.kind);

        if (!visited.has(target)) {
          visited.add(target);
          queue.push(target);
        }
      }
    }
  }

  for (const [target, dialects] of reachableDialects) {
    if (dialects.size === 1) {
      const kind = Array.from(dialects)[0];
      map.set(target, {
        kind,
        genFn: target,
        call: null,
        options: null,
        delegated: true,
      });
    }
  }

  return map;
}

export function getCoroutineContext(
  node: TSESTree.Node,
  context: Context,
  factories: ResolvedFactories = resolveFactories(),
): CoroutineContext | null {
  const fileMap = getCoroutineFileMap(context, factories);

  if (node.type === AST_NODE_TYPES.CallExpression) {
    const arg0 = node.arguments[0];
    if (arg0) {
      const unwrapped = unwrapParens(arg0);
      if (
        unwrapped.type === AST_NODE_TYPES.FunctionDeclaration ||
        unwrapped.type === AST_NODE_TYPES.FunctionExpression
      ) {
        const ctx = fileMap.get(unwrapped);
        if (ctx) return ctx;
      } else if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        const genFn = resolveGeneratorFnFromIdentifier(unwrapped, context);
        if (genFn) {
          const ctx = fileMap.get(genFn);
          if (ctx) return ctx;
        }
      }
    }
  }

  let curr: TSESTree.Node | undefined = node;
  let enclosingFn: TSESTree.FunctionLike | null = null;

  while (curr) {
    if (
      curr.type === AST_NODE_TYPES.FunctionDeclaration ||
      curr.type === AST_NODE_TYPES.FunctionExpression ||
      curr.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      enclosingFn = curr;
      break;
    }
    curr = curr.parent;
  }

  if (!enclosingFn?.generator || enclosingFn.async) {
    return null;
  }

  return fileMap.get(enclosingFn) ?? null;
}
