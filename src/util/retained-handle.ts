import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, TSESLint as ESLintScope } from '@typescript-eslint/utils';

const { DefinitionType } = ESLintScope.Scope;

function findVariable(name: string, scope: TSESLint.Scope.Scope): TSESLint.Scope.Variable | null {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    const variable = current.set.get(name);
    if (variable) {
      return variable;
    }
    current = current.upper;
  }
  return null;
}

function propertyName(node: TSESTree.Node): string | null {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function isCancelAccess(ref: TSESLint.Scope.Reference): boolean {
  const parent = ref.identifier.parent;
  return (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === ref.identifier &&
    !parent.computed &&
    propertyName(parent.property) === 'cancel'
  );
}

function isRefOptionValue(ref: TSESLint.Scope.Reference): boolean {
  const property = ref.identifier.parent;
  if (property?.type !== AST_NODE_TYPES.Property || property.value !== ref.identifier) {
    return false;
  }
  if (property.computed || propertyName(property.key) !== 'ref') {
    return false;
  }
  const options = property.parent;
  return (
    options.type === AST_NODE_TYPES.ObjectExpression &&
    options.parent.type === AST_NODE_TYPES.NewExpression &&
    options.parent.arguments.includes(options)
  );
}

function isWithResolversCall(node: TSESTree.Node | null): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    propertyName(node.callee.property) === 'withResolvers'
  );
}

/** `const { promise, cancel } = X.withResolvers()`: the promise binding comes with its own cancel. */
function isWithResolversPromise(identifier: TSESTree.Identifier, declarator: TSESTree.VariableDeclarator): boolean {
  if (declarator.id.type !== AST_NODE_TYPES.ObjectPattern || !isWithResolversCall(declarator.init)) {
    return false;
  }
  let ownsIdentifier = false;
  let hasCancel = false;
  for (const property of declarator.id.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) {
      continue;
    }
    const key = propertyName(property.key);
    if (key === 'cancel') {
      hasCancel = true;
    }
    if (key === 'promise' && property.value === identifier) {
      ownsIdentifier = true;
    }
  }
  return ownsIdentifier && hasCancel;
}

function isAbortControllerBinding(name: string, scope: TSESLint.Scope.Scope): boolean {
  const variable = findVariable(name, scope);
  const def = variable?.defs[0];
  if (def?.type !== DefinitionType.Variable || def.node.type !== AST_NODE_TYPES.VariableDeclarator) {
    return false;
  }
  const init = def.node.init;
  return (
    init?.type === AST_NODE_TYPES.NewExpression &&
    init.callee.type === AST_NODE_TYPES.Identifier &&
    init.callee.name === 'AbortController'
  );
}

/** `const p = start({ signal: controller.signal })` with `controller` a local `new AbortController()`. */
function isWiredThroughSignalOption(declarator: TSESTree.VariableDeclarator, scope: TSESLint.Scope.Scope): boolean {
  const init = declarator.init;
  if (init?.type !== AST_NODE_TYPES.CallExpression && init?.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  for (const arg of init.arguments) {
    if (arg.type !== AST_NODE_TYPES.ObjectExpression) {
      continue;
    }
    for (const property of arg.properties) {
      if (property.type !== AST_NODE_TYPES.Property || property.computed || propertyName(property.key) !== 'signal') {
        continue;
      }
      const value = property.value;
      if (
        value.type === AST_NODE_TYPES.MemberExpression &&
        !value.computed &&
        propertyName(value.property) === 'signal' &&
        value.object.type === AST_NODE_TYPES.Identifier &&
        isAbortControllerBinding(value.object.name, scope)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when `identifier` names a local `const`/`let` declared in the same function scope as `scope`
 * and that binding has a visible cancel path: a `.cancel` access on it anywhere in its scope, the
 * binding passed as the `ref` option of a `new` expression, a `promise` destructured together with
 * `cancel` from `withResolvers()`, or a value started with the `signal` of a local `AbortController`.
 * Scope based and syntactic: a cancel path in another function is not seen.
 */
export function hasRetainedHandle(identifier: TSESTree.Identifier, scope: TSESLint.Scope.Scope): boolean {
  const variable = findVariable(identifier.name, scope);
  if (!variable || variable.scope.variableScope !== scope.variableScope) {
    return false;
  }
  const def = variable.defs[0];
  if (def?.type !== DefinitionType.Variable || def.parent?.type !== AST_NODE_TYPES.VariableDeclaration) {
    return false;
  }
  if (def.parent.kind !== 'const' && def.parent.kind !== 'let') {
    return false;
  }
  const declarator = def.node;
  if (isWithResolversPromise(def.name, declarator)) {
    return true;
  }
  if (isWiredThroughSignalOption(declarator, variable.scope)) {
    return true;
  }
  return variable.references.some((ref) => isCancelAccess(ref) || isRefOptionValue(ref));
}
