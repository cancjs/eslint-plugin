import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { isCoroutineFnIdent } from './canc-imports.js';

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

/**
 * A user coroutine factory. A string matches by callee name (an identifier
 * call or a non-computed member call on any object). An object matches the
 * binding this file imports as `name` from exactly `source`.
 */
export type FactoryEntry = string | { name: string; source: string };

/** The coroutine factory options shared by every coroutine rule. */
export interface FactoryOptions {
  /** Added to the built-in `cancAsync` driver. */
  additionalCoroutineFactories?: readonly FactoryEntry[];
  /** Added to the built-in `cancGenAsync` driver. */
  additionalGenCoroutineFactories?: readonly FactoryEntry[];
  /** Replaces the built-in `cancAsync` driver. */
  coroutineFactories?: readonly FactoryEntry[];
  /** Replaces the built-in `cancGenAsync` driver. */
  genCoroutineFactories?: readonly FactoryEntry[];
}

/** Factory lists per dialect, resolved once per rule from its options. */
export interface ResolvedFactories {
  cancAsync: FactoryEntry[];
  cancGenAsync: FactoryEntry[];
  replaceCancAsync: boolean;
  replaceCancGenAsync: boolean;
}

export type CoroutineDialect = 'cancAsync' | 'cancGenAsync';

const factoryListSchema: JSONSchema4 = {
  type: 'array',
  uniqueItems: true,
  items: {
    oneOf: [
      { type: 'string', minLength: 1 },
      {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          source: { type: 'string', minLength: 1 },
        },
        required: ['name', 'source'],
        additionalProperties: false,
      },
    ],
  },
};

/** JSON schema `properties` fragment for a rule options object. */
export const factoryOptionsSchema: Record<string, JSONSchema4> = {
  additionalCoroutineFactories: factoryListSchema,
  additionalGenCoroutineFactories: factoryListSchema,
  coroutineFactories: factoryListSchema,
  genCoroutineFactories: factoryListSchema,
};

/** JSON schema `allOf` entries: the add and replace options of one dialect exclude each other. */
export const factoryOptionsConstraints: JSONSchema4[] = [
  { type: 'object', not: { type: 'object', required: ['additionalCoroutineFactories', 'coroutineFactories'] } },
  { type: 'object', not: { type: 'object', required: ['additionalGenCoroutineFactories', 'genCoroutineFactories'] } },
];

const DEFAULT_FACTORIES: ResolvedFactories = {
  cancAsync: [],
  cancGenAsync: [],
  replaceCancAsync: false,
  replaceCancGenAsync: false,
};

const resolvedCache = new WeakMap<FactoryOptions, ResolvedFactories>();

function entryKey(entry: FactoryEntry): string {
  return typeof entry === 'string' ? entry : `${entry.name} from ${entry.source}`;
}

/**
 * Merge the factory options of one rule into per-dialect lists.
 *
 * Throws when an entry is listed for both dialects. Without options the
 * result is a shared default, so zero-config callers see one object.
 */
export function resolveFactories(options?: FactoryOptions): ResolvedFactories {
  if (!options) {
    return DEFAULT_FACTORIES;
  }
  const cached = resolvedCache.get(options);
  if (cached) {
    return cached;
  }

  const cancAsync = [...(options.additionalCoroutineFactories ?? []), ...(options.coroutineFactories ?? [])];
  const cancGenAsync = [...(options.additionalGenCoroutineFactories ?? []), ...(options.genCoroutineFactories ?? [])];

  const asyncKeys = new Set(cancAsync.map(entryKey));
  const duplicate = cancGenAsync.find((entry) => asyncKeys.has(entryKey(entry)));
  if (duplicate !== undefined) {
    throw new Error(
      `Coroutine factory '${entryKey(duplicate)}' is listed for both the cancAsync and the cancGenAsync dialect.`,
    );
  }

  const resolved: ResolvedFactories = {
    cancAsync,
    cancGenAsync,
    replaceCancAsync: options.coroutineFactories !== undefined,
    replaceCancGenAsync: options.genCoroutineFactories !== undefined,
  };
  resolvedCache.set(options, resolved);
  return resolved;
}

// source -> local name -> exported name ('*' for a namespace object)
type ImportScan = Map<string, Map<string, string>>;

const importScanCache = new WeakMap<TSESTree.Program, ImportScan>();

function requireSourceOf(node: TSESTree.Expression | null): string | undefined {
  if (
    node?.type === AST_NODE_TYPES.CallExpression &&
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

function bindingsFor(scan: ImportScan, source: string): Map<string, string> {
  let bindings = scan.get(source);
  if (!bindings) {
    bindings = new Map();
    scan.set(source, bindings);
  }
  return bindings;
}

function scanProgram(program: TSESTree.Program): ImportScan {
  const scan: ImportScan = new Map();
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      if (statement.importKind === 'type') {
        continue;
      }
      const bindings = bindingsFor(scan, statement.source.value);
      for (const specifier of statement.specifiers) {
        if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
          if (specifier.importKind === 'type') {
            continue;
          }
          const exported =
            specifier.imported.type === AST_NODE_TYPES.Identifier ?
              specifier.imported.name
            : String(specifier.imported.value);
          bindings.set(specifier.local.name, exported);
        } else if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
          bindings.set(specifier.local.name, 'default');
        } else {
          bindings.set(specifier.local.name, '*');
        }
      }
    } else if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        const source = requireSourceOf(declarator.init);
        if (source === undefined) {
          continue;
        }
        const bindings = bindingsFor(scan, source);
        if (declarator.id.type === AST_NODE_TYPES.Identifier) {
          bindings.set(declarator.id.name, '*');
        } else if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
          for (const property of declarator.id.properties) {
            if (
              property.type === AST_NODE_TYPES.Property &&
              property.key.type === AST_NODE_TYPES.Identifier &&
              property.value.type === AST_NODE_TYPES.Identifier
            ) {
              bindings.set(property.value.name, property.key.name);
            }
          }
        }
      }
    }
  }
  return scan;
}

/** Local bindings this file imports (ESM or `require`) from exactly `source`. */
export function scanImports(program: TSESTree.Program, source: string): ReadonlyMap<string, string> {
  let scan = importScanCache.get(program);
  if (!scan) {
    scan = scanProgram(program);
    importScanCache.set(program, scan);
  }
  return scan.get(source) ?? new Map<string, string>();
}

// shadowing: the name at this position must resolve to the import or require declarator itself
function isImportedHere(node: TSESTree.Identifier, context: Context, source: string): boolean {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) {
      return variable.defs.some((def) => {
        const { node } = def;
        if (
          node.type === AST_NODE_TYPES.ImportSpecifier ||
          node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
        ) {
          return node.parent.type === AST_NODE_TYPES.ImportDeclaration && node.parent.source.value === source;
        }
        return node.type === AST_NODE_TYPES.VariableDeclarator && requireSourceOf(node.init) === source;
      });
    }
    scope = scope.upper;
  }
  return false;
}

function memberPropertyName(node: TSESTree.MemberExpression): string | undefined {
  return !node.computed && node.property.type === AST_NODE_TYPES.Identifier ? node.property.name : undefined;
}

function entryMatches(callee: TSESTree.Node, context: Context, entry: FactoryEntry): boolean {
  if (typeof entry === 'string') {
    if (callee.type === AST_NODE_TYPES.Identifier) {
      return callee.name === entry;
    }
    return callee.type === AST_NODE_TYPES.MemberExpression && memberPropertyName(callee) === entry;
  }

  const bindings = scanImports(context.sourceCode.ast, entry.source);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return bindings.get(callee.name) === entry.name && isImportedHere(callee, context, entry.source);
  }
  if (callee.type === AST_NODE_TYPES.MemberExpression && callee.object.type === AST_NODE_TYPES.Identifier) {
    return (
      memberPropertyName(callee) === entry.name &&
      bindings.get(callee.object.name) === '*' &&
      isImportedHere(callee.object, context, entry.source)
    );
  }
  return false;
}

/** Which coroutine dialect a call with this callee drives, if any. */
export function calleeDialect(
  callee: TSESTree.Node,
  context: Context,
  resolved: ResolvedFactories,
): CoroutineDialect | null {
  if (!resolved.replaceCancAsync && isCoroutineFnIdent(callee, context, 'cancAsync')) {
    return 'cancAsync';
  }
  if (!resolved.replaceCancGenAsync && isCoroutineFnIdent(callee, context, 'cancGenAsync')) {
    return 'cancGenAsync';
  }
  if (resolved.cancAsync.some((entry) => entryMatches(callee, context, entry))) {
    return 'cancAsync';
  }
  if (resolved.cancGenAsync.some((entry) => entryMatches(callee, context, entry))) {
    return 'cancGenAsync';
  }
  return null;
}
