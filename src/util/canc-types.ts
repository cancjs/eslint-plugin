import { isTypeAnyType, isTypeUnknownType } from '@typescript-eslint/type-utils';
import type { ParserServicesWithTypeInformation } from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

import { getCancBindings } from './canc-imports.js';
import { getCancSettings, type ResolvedCancSettings } from './settings.js';

/**
 * Return typed parser services when the linted file has full type information available, otherwise
 * null. Rules that need the type layer call this once and bail cleanly (no-op) when it returns null,
 * so a type-aware rule degrades to silence rather than throwing when run without TypeScript or
 * without `parserOptions.projectService`/`project`.
 */
export function getCancServices(
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): ParserServicesWithTypeInformation | null {
  const services = context.sourceCode.parserServices;

  if (!services?.program || typeof services.getTypeAtLocation !== 'function') {
    return null;
  }

  return services as ParserServicesWithTypeInformation;
}

/**
 * Turn a configured module specifier (e.g. `@cancjs/coroutine/gen`) into the package-root path
 * segment used to recognize a symbol's declaration file (`node_modules/@cancjs/coroutine/`). Subpath
 * and `/native` suffixes collapse to the same package root, so a type declared anywhere in the
 * package still matches.
 */
function sourceToPackageSegment(source: string): string {
  const parts = source.split('/');
  const pkg = source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return `/node_modules/${pkg}/`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

// Mirrors ts.SymbolFlags.Alias; typescript is a type-only import here, so the enum is not available at runtime.
const SYMBOL_FLAG_ALIAS = 2097152;

/**
 * A symbol is a canc entity when at least one of its declarations lives in a declaration file under
 * one of the configured canc packages. Path-based nominal check: no runtime dependency on the real
 * packages, works against the hand-derived fixture stubs and against real installs alike.
 */
function symbolDeclaredInCancSource(
  symbol: ts.Symbol | undefined,
  settings: ResolvedCancSettings,
  checker?: ts.TypeChecker,
  context?: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  if (!symbol) {
    return false;
  }
  let target = symbol;
  if (checker && symbol.flags & SYMBOL_FLAG_ALIAS) {
    try {
      target = checker.getAliasedSymbol(target);
    } catch {
      // ignore
    }
  }

  const declarations = [
    ...(target.getDeclarations() ?? []),
    ...(target !== symbol ? (symbol.getDeclarations() ?? []) : []),
  ];

  if (declarations.length === 0) {
    if (context) {
      const bindings = getCancBindings(context);
      const name = symbol.getName();
      const binding = bindings.get(name);
      if (
        binding &&
        settings.sources.some(
          (s) => binding.source === s || binding.source.startsWith(s + '/') || s.startsWith(binding.source),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  const segments = settings.sources.map(sourceToPackageSegment);

  for (const declaration of declarations) {
    const filePath = normalizePath(declaration.getSourceFile().fileName);
    if (segments.some((segment) => filePath.includes(segment))) {
      return true;
    }
  }

  return false;
}

function typeNameMatches(symbol: ts.Symbol | undefined, names: string[]): boolean {
  return symbol !== undefined && names.includes(symbol.getName());
}

function typeParts(type: ts.Type): ts.Type[] {
  if (type.isUnion() || type.isIntersection()) {
    return type.types;
  }
  return [type];
}

/**
 * Base types of a class/interface type, so a subclass of CancelablePromise is still recognized as
 * cancelable. Guarded: `getBaseTypes` only exists on interface/class object types.
 */
function baseTypesOf(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  if (type.isClassOrInterface()) {
    return checker.getBaseTypes(type);
  }
  return [];
}

function matchesNominalName(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  names: string[],
  seen: Set<ts.Type>,
  context?: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  for (const part of typeParts(type)) {
    if (part !== type && matchesNominalName(part, checker, settings, names, seen, context)) {
      return true;
    }

    const target = 'target' in part ? (part as { target?: { symbol?: ts.Symbol } }).target : undefined;
    const targetSymbol = target?.symbol;
    const partSymbol = part.getSymbol();
    const aliasSymbol = part.aliasSymbol;

    const candidateSymbols = [partSymbol, aliasSymbol, targetSymbol];
    for (const sym of candidateSymbols) {
      if (!sym) continue;
      if (typeNameMatches(sym, names) && symbolDeclaredInCancSource(sym, settings, checker, context)) {
        return true;
      }
      if (sym.flags & SYMBOL_FLAG_ALIAS) {
        try {
          const aliased = checker.getAliasedSymbol(sym);
          if (typeNameMatches(aliased, names) && symbolDeclaredInCancSource(aliased, settings, checker, context)) {
            return true;
          }
        } catch {
          // ignore
        }
      }
    }

    for (const base of baseTypesOf(part, checker)) {
      if (matchesNominalName(base, checker, settings, names, seen, context)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Nominal check: is `type` (or a union member, or a base type of it) a CancelablePromise declared in
 * a configured canc package? Walks unions and the base-type chain so subclasses match. Extra nominal
 * names are contributed by `settings.cancelableTypeNames`.
 */
export function isCancelableType(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context?: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  return matchesNominalName(type, checker, settings, settings.cancelableTypeNames, new Set(), context);
}

/**
 * Nominal check for the lazy-promise family (`LazyPromise` and configured extras). Kept distinct from
 * `isCancelableType`: a lazy promise is cancelable-ish but has different execution semantics, so
 * rules treat it as its own category.
 */
export function isLazyType(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context?: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  return matchesNominalName(type, checker, settings, settings.lazyTypeNames, new Set(), context);
}

/**
 * Resolve the static type of an expression node and report whether it is cancelable. Convenience for
 * rules that hold a node rather than a `ts.Type`.
 */
export function isCancelableExpression(
  node: TSESTree.Expression,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
  settings: ResolvedCancSettings,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }

  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  return isCancelableType(type, checker, settings, context);
}

/**
 * Resolve the static type of an expression node and report whether it is a LazyPromise.
 */
export function isLazyExpression(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
  settings: ResolvedCancSettings,
): boolean {
  const services = getCancServices(context);
  if (!services) {
    return false;
  }

  const type = services.getTypeAtLocation(node);
  return isLazyType(type, services.program.getTypeChecker(), settings, context);
}

/**
 * True when `type` is a plain (non-cancelable) promise sink: it is Promise-compatible (thenable) but
 * is NOT cancelable and does NOT include a cancelable member in a union. This is the shape that
 * silently swallows cancellation, so passing a cancelable value into such a sink is the core defect
 * the plugin flags.
 */
export function typeIsPlainPromiseSink(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
): boolean {
  const parts = typeParts(type);

  let sawThenable = false;

  for (const part of parts) {
    if (isCancelableType(part, checker, settings) || isLazyType(part, checker, settings)) {
      return false;
    }
    if (isThenableType(part, checker)) {
      sawThenable = true;
    }
  }

  return sawThenable;
}

function isThenableType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const then = type.getProperty('then');
  if (!then) {
    return false;
  }
  const thenType = checker.getTypeOfSymbol(then);
  return thenType.getCallSignatures().length > 0;
}

/**
 * Nominal check: does `type` (or any union member of it) have cancelable elements when indexed?
 * Checks `isCancelableType` directly and on the numeric index type (array / tuple element type).
 */
export function typeHasCancelableElement(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
): boolean {
  if (type.isUnion()) {
    return type.types.some((t) => typeHasCancelableElement(t, checker, settings));
  }
  if (isCancelableType(type, checker, settings)) {
    return true;
  }
  const numberIndex = checker.getIndexTypeOfType(type, 1 /* IndexKind.Number */);
  if (numberIndex && isCancelableType(numberIndex, checker, settings)) {
    return true;
  }
  return false;
}

/**
 * Report whether an argument node (array expression or iterable expression) contains any cancelable input.
 * Keeps rule files free of direct TypeScript checker calls (Invariant 4).
 */
export function hasCancelableElements(
  argNode: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
  settings: ResolvedCancSettings,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }

  const checker = services.program.getTypeChecker();

  if (argNode.type === AST_NODE_TYPES.ArrayExpression) {
    if (argNode.elements.length === 0) {
      return false;
    }
    for (const elem of argNode.elements) {
      if (!elem) {
        continue;
      }
      if (elem.type === AST_NODE_TYPES.SpreadElement) {
        const spreadType = services.getTypeAtLocation(elem.argument);
        if (typeHasCancelableElement(spreadType, checker, settings)) {
          return true;
        }
      } else {
        const isCanc =
          isCancelableExpression(elem, context, settings) ||
          typeHasCancelableElement(services.getTypeAtLocation(elem), checker, settings);
        if (isCanc) {
          return true;
        }
      }
    }
    return false;
  }

  const argType = services.getTypeAtLocation(argNode);
  return typeHasCancelableElement(argType, checker, settings);
}

/**
 * True when expression `node` is typed as a plain (non-cancelable) promise sink.
 * Degrades safely to false when no parser services or program exist.
 */
export function isPlainPromiseSinkExpression(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const settings = getCancSettings(context);
  const type = services.getTypeAtLocation(node);
  return typeIsPlainPromiseSink(type, checker, settings);
}

/**
 * True when expression `node` is typed as a CancelablePromise or LazyPromise.
 */
export function isCancelableOrLazyExpression(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const settings = getCancSettings(context);
  const type = services.getTypeAtLocation(node);
  if (isCancelableType(type, checker, settings, context) || isLazyType(type, checker, settings, context)) {
    return true;
  }

  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    ['then', 'catch', 'finally'].includes(node.callee.property.name)
  ) {
    return isCancelableOrLazyExpression(node.callee.object, context);
  }

  return false;
}

/**
 * Check combinator argument (array of promises or iterable) and return any elements
 * that are plain promise sinks.
 */
export function checkCombinatorGapElements(
  argNode: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): TSESTree.Node[] {
  const services = getCancServices(context);
  if (!services?.program) {
    return [];
  }
  const checker = services.program.getTypeChecker();
  const settings = getCancSettings(context);

  if (argNode.type === AST_NODE_TYPES.ArrayExpression) {
    const gaps: TSESTree.Node[] = [];
    for (const elem of argNode.elements) {
      if (!elem) continue;
      const target = elem.type === AST_NODE_TYPES.SpreadElement ? elem.argument : elem;
      const elemType = services.getTypeAtLocation(target);
      if (typeIsPlainPromiseSink(elemType, checker, settings)) {
        gaps.push(target);
      }
    }
    return gaps;
  }

  const argType = services.getTypeAtLocation(argNode);
  const indexType = checker.getIndexTypeOfType(argType, 1 /* IndexKind.Number */);
  if (indexType && typeIsPlainPromiseSink(indexType, checker, settings)) {
    return [argNode];
  }
  return [];
}

/**
 * Check if an inline callback (ArrowFunctionExpression or FunctionExpression) returns
 * a plain-promise-typed value.
 */
export function inlineCallbackReturnsPlainPromise(
  cbNode: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  if (cbNode.type !== AST_NODE_TYPES.ArrowFunctionExpression && cbNode.type !== AST_NODE_TYPES.FunctionExpression) {
    return false;
  }

  if (cbNode.async) {
    return true;
  }

  if (cbNode.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isPlainPromiseSinkExpression(cbNode.body, context);
  }

  const returns: TSESTree.ReturnStatement[] = [];
  function findReturns(node: TSESTree.Node): void {
    if (
      node !== cbNode &&
      (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.FunctionDeclaration)
    ) {
      return;
    }
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      returns.push(node);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              findReturns(item as TSESTree.Node);
            }
          }
        } else if ('type' in child) {
          findReturns(child as TSESTree.Node);
        }
      }
    }
  }

  findReturns(cbNode.body);

  for (const ret of returns) {
    if (ret.argument && isPlainPromiseSinkExpression(ret.argument, context)) {
      return true;
    }
  }

  return false;
}

/**
 * Report whether typescript type services are available on the rule context.
 */
export function hasTypeServices(context: TSESLint.RuleContext<string, readonly unknown[]>): boolean {
  return getCancServices(context) !== null;
}

/**
 * Nominal check for pattern destructuring against cancelable types.
 */
export function isCancelablePattern(
  pattern: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const settings = getCancSettings(context);
  const type = services.getTypeAtLocation(pattern);
  return isCancelableType(type, checker, settings, context);
}

/**
 * Nominal check for executor context objects (e.g. IExecutorContext or IExecutorCtx)
 * from configured canc sources.
 */
export function isExecutorContextExpression(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const settings = getCancSettings(context);
  const type = services.getTypeAtLocation(node);
  if (matchesNominalName(type, checker, settings, ['IExecutorContext', 'IExecutorCtx'], new Set(), context)) {
    return true;
  }
  const handleCancelProp = type.getProperty('handleCancel');
  if (handleCancelProp && symbolDeclaredInCancSource(handleCancelProp, settings, checker, context)) {
    return true;
  }
  return false;
}

/**
 * True when the static type of `node` is thenable (Promise-like).
 */
export function isThenableExpression(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  return isThenableType(type, checker);
}

/**
 * True when `fnNode` is a function or callback whose return type is cancelable.
 */
export function isCancelableReturnFunction(
  fnNode: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const settings = getCancSettings(context);

  if (fnNode.type === AST_NODE_TYPES.ArrowFunctionExpression && fnNode.body.type !== AST_NODE_TYPES.BlockStatement) {
    if (isCancelableExpression(fnNode.body, context, settings)) {
      return true;
    }
  }

  const type = services.getTypeAtLocation(fnNode);
  const signatures = type.getCallSignatures();
  for (const sig of signatures) {
    const returnType = sig.getReturnType();
    if (isCancelableType(returnType, checker, settings, context)) {
      return true;
    }
  }

  return false;
}

function isProvablyNonIteratorType(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.every(isProvablyNonIteratorType);
  }
  if (isTypeAnyType(type) || isTypeUnknownType(type)) {
    return false;
  }
  return type.getProperty('next') === undefined && !type.isTypeParameter();
}

/**
 * True when every call signature of `fnNode` returns a type that provably has no `next` method.
 * Returns false without type information, or when a return type is `any`, `unknown` or generic.
 */
export function isNonIteratorReturnFunction(
  fnNode: TSESTree.Node,
  context: TSESLint.RuleContext<string, readonly unknown[]>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const signatures = services.getTypeAtLocation(fnNode).getCallSignatures();
  return signatures.length > 0 && signatures.every((sig) => isProvablyNonIteratorType(sig.getReturnType()));
}
