import type { ParserServicesWithTypeInformation } from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

import type { ResolvedCancSettings } from './settings.js';

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

/**
 * A symbol is a canc entity when at least one of its declarations lives in a declaration file under
 * one of the configured canc packages. Path-based nominal check: no runtime dependency on the real
 * packages, works against the hand-derived fixture stubs and against real installs alike.
 */
function symbolDeclaredInCancSource(symbol: ts.Symbol | undefined, settings: ResolvedCancSettings): boolean {
  const declarations = symbol?.getDeclarations();
  if (!declarations || declarations.length === 0) {
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
): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);

  for (const part of typeParts(type)) {
    if (part !== type && matchesNominalName(part, checker, settings, names, seen)) {
      return true;
    }

    const target = 'target' in part ? (part as { target?: { symbol?: ts.Symbol } }).target : undefined;
    const targetSymbol = target?.symbol;
    const symbol = part.getSymbol() ?? part.aliasSymbol ?? targetSymbol;
    const nameMatch = typeNameMatches(symbol, names) || typeNameMatches(targetSymbol, names);
    const sourceMatch =
      symbolDeclaredInCancSource(symbol, settings) || symbolDeclaredInCancSource(targetSymbol, settings);
    if (nameMatch && sourceMatch) {
      return true;
    }

    for (const base of baseTypesOf(part, checker)) {
      if (matchesNominalName(base, checker, settings, names, seen)) {
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
export function isCancelableType(type: ts.Type, checker: ts.TypeChecker, settings: ResolvedCancSettings): boolean {
  return matchesNominalName(type, checker, settings, settings.cancelableTypeNames, new Set());
}

/**
 * Nominal check for the lazy-promise family (`LazyPromise` and configured extras). Kept distinct from
 * `isCancelableType`: a lazy promise is cancelable-ish but has different execution semantics, so
 * rules treat it as its own category.
 */
export function isLazyType(type: ts.Type, checker: ts.TypeChecker, settings: ResolvedCancSettings): boolean {
  return matchesNominalName(type, checker, settings, settings.lazyTypeNames, new Set());
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
  if (!services) {
    return false;
  }

  const type = services.getTypeAtLocation(node);
  return isCancelableType(type, services.program.getTypeChecker(), settings);
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
