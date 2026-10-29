import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

import { refersTo } from './canc-imports.js';
import { getCancServices, isCancelableType, isLazyType, symbolDeclaredInCancSource } from './canc-types.js';
import { type CompiledMatchers, matchesName, matchesType } from './class-matcher.js';
import { getCancSettings, type ResolvedCancSettings } from './settings.js';

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

export interface FailureMembers {
  listed: ts.Type[];
  open: boolean;
  defined: boolean;
}

function isCancelBrandProperty(prop: ts.Symbol, checker: ts.TypeChecker): boolean {
  const name = prop.name;
  if (name.includes('CANCEL_ERROR_BRAND') || name.includes('@cancjs/promise:CancelError')) {
    return true;
  }
  const escaped = String(prop.escapedName);
  if (escaped.includes('CANCEL_ERROR_BRAND') || escaped.includes('@cancjs/promise:CancelError')) {
    return true;
  }
  if (prop.declarations) {
    for (const d of prop.declarations) {
      if (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d)) {
        if (ts.isComputedPropertyName(d.name)) {
          const expr = d.name.expression;
          const text = expr.getText();
          if (text.includes('@cancjs/promise:CancelError') || text.includes('CANCEL_ERROR_BRAND')) {
            return true;
          }
          const sym = checker.getSymbolAtLocation(expr);
          if (sym) {
            if (sym.name.includes('CANCEL_ERROR_BRAND') || sym.name.includes('@cancjs/promise:CancelError')) {
              return true;
            }
            if (sym.declarations) {
              for (const symDecl of sym.declarations) {
                const declText = symDecl.getText();
                if (declText.includes('@cancjs/promise:CancelError') || declText.includes('CANCEL_ERROR_BRAND')) {
                  return true;
                }
              }
            }
          }
        }
      }
    }
  }
  return false;
}

function typeHasCancelBrand(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnion()) {
    return type.types.every((t) => typeHasCancelBrand(t, checker));
  }
  if (type.isIntersection()) {
    return type.types.some((t) => typeHasCancelBrand(t, checker));
  }
  const props = checker.getPropertiesOfType(type);
  for (const prop of props) {
    if (isCancelBrandProperty(prop, checker)) {
      return true;
    }
  }
  if (type.isClassOrInterface()) {
    for (const base of checker.getBaseTypes(type)) {
      if (typeHasCancelBrand(base, checker)) {
        return true;
      }
    }
  }
  return false;
}

export function isCancelErrorType(type: ts.Type, checker: ts.TypeChecker, settings?: ResolvedCancSettings): boolean {
  if (typeHasCancelBrand(type, checker)) {
    return true;
  }
  const sym = type.getSymbol() ?? type.aliasSymbol;
  if (sym?.name === 'CancelError') {
    const decls = sym.getDeclarations() ?? [];
    for (const decl of decls) {
      const fn = decl.getSourceFile().fileName.replace(/\\/g, '/');
      if (
        fn.includes('node_modules/@cancjs/promise') ||
        fn.includes('packages/canc-promise') ||
        settings?.sources.some((s) => fn.includes(s))
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isCancelErrorCtorNode(node: TSESTree.Node | null | undefined, context: Context): boolean {
  if (node?.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  return refersTo(node.callee, context, 'CancelError');
}

export function isCancelErrorThrow(node: TSESTree.Node | null | undefined, context: Context): boolean {
  if (!node) {
    return false;
  }
  if (isCancelErrorCtorNode(node, context)) {
    return true;
  }
  const services = getCancServices(context);
  if (services?.program) {
    const checker = services.program.getTypeChecker();
    const type = services.getTypeAtLocation(node);
    const settings = getCancSettings(context);
    if (isCancelErrorType(type, checker, settings)) {
      return true;
    }
  }
  return false;
}

export function isUnlistedMarker(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.getProperty('_cancUnlisted')) {
    return true;
  }
  const sym = type.aliasSymbol ?? type.symbol;
  if (sym?.name === 'Unlisted') {
    return true;
  }
  const props = checker.getPropertiesOfType(type);
  return props.some((p) => p.name === '_cancUnlisted' || String(p.escapedName) === '_cancUnlisted');
}

function isCancCarrierType(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context?: Context,
): boolean {
  if (isCancelableType(type, checker, settings, context) || isLazyType(type, checker, settings, context)) {
    return true;
  }
  const sym = type.aliasSymbol ?? type.getSymbol() ?? type.symbol;
  if (sym && symbolDeclaredInCancSource(sym, settings, checker, context)) {
    return true;
  }
  if (type.isClassOrInterface()) {
    for (const base of checker.getBaseTypes(type)) {
      if (isCancCarrierType(base, checker, settings, context)) {
        return true;
      }
    }
  }
  return false;
}

function isFailureUniqueSymbolProperty(
  prop: ts.Symbol,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context?: Context,
): boolean {
  const name = prop.name;
  const escaped = String(prop.escapedName);

  const isFailureSymbolName =
    name === '__@FAILURE@' ||
    name.startsWith('__@FAILURE@') ||
    escaped.startsWith('__@FAILURE@') ||
    name === '[FAILURE]';

  if (!isFailureSymbolName) {
    return false;
  }

  return symbolDeclaredInCancSource(prop, settings, checker, context);
}

function findFailureProperty(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context?: Context,
): ts.Symbol | undefined {
  if (!isCancCarrierType(type, checker, settings, context)) {
    return undefined;
  }

  const props = checker.getPropertiesOfType(type);
  for (const prop of props) {
    if (isFailureUniqueSymbolProperty(prop, checker, settings, context)) {
      return prop;
    }
  }
  return undefined;
}

function extractFromFailureType(failureType: ts.Type, checker: ts.TypeChecker): FailureMembers {
  if (failureType.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) {
    return { listed: [], open: false, defined: false };
  }

  if (failureType.flags & ts.TypeFlags.Never) {
    return { listed: [], open: false, defined: true };
  }

  const rawParts = failureType.isUnion() ? failureType.types : [failureType];
  const parts = rawParts.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)));

  let open = false;
  const listed: ts.Type[] = [];

  for (const part of parts) {
    if (isUnlistedMarker(part, checker)) {
      open = true;
    } else if (!isCancelErrorType(part, checker)) {
      listed.push(part);
    }
  }

  return {
    listed,
    open,
    defined: true,
  };
}

export function getFailureMembers(
  type: ts.Type,
  checker: ts.TypeChecker,
  settings?: ResolvedCancSettings,
  context?: Context,
): FailureMembers {
  const resolvedSettings =
    settings ??
    (context ?
      getCancSettings(context)
    : ({
        sources: ['@cancjs/promise', '@cancjs/coroutine', '@cancjs/toolbox'],
        cancelableTypeNames: ['CancelablePromise'],
        lazyTypeNames: ['LazyPromise'],
      } as ResolvedCancSettings));

  if (type.isUnion()) {
    const parts = type.types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Null)),
    );
    if (parts.length === 0) {
      return { listed: [], open: false, defined: false };
    }

    const carrierParts = parts.filter((p) => isCancCarrierType(p, checker, resolvedSettings, context));
    if (carrierParts.length === 0) {
      return { listed: [], open: false, defined: false };
    }

    const results = carrierParts.map((t) => getFailureMembers(t, checker, resolvedSettings, context));
    const allDefined = results.every((r) => r.defined);
    const anyOpen = results.some((r) => r.open);

    const listedMap = new Map<string, ts.Type>();
    for (const r of results) {
      for (const t of r.listed) {
        const id = checker.typeToString(t);
        if (!listedMap.has(id)) {
          listedMap.set(id, t);
        }
      }
    }

    return {
      listed: Array.from(listedMap.values()),
      open: anyOpen,
      defined: allDefined,
    };
  }

  // 1. Direct [FAILURE] property lookup on canc carrier
  const failureProp = findFailureProperty(type, checker, resolvedSettings, context);
  if (failureProp) {
    const loc = failureProp.valueDeclaration ?? failureProp.declarations?.[0];
    const failureType = loc ? checker.getTypeOfSymbolAtLocation(failureProp, loc) : undefined;
    if (failureType) {
      const res = extractFromFailureType(failureType, checker);
      if (res.defined) {
        return res;
      }
    }
  }

  // 2. Intersection
  if (type.isIntersection()) {
    for (const t of type.types) {
      const res = getFailureMembers(t, checker, resolvedSettings, context);
      if (res.defined) {
        return res;
      }
    }
  }

  // 3. Generator unwrapping (yield* step)
  const sym = type.aliasSymbol ?? type.getSymbol() ?? type.symbol;
  const symName = sym?.name;
  if (symName === 'Generator' || symName === 'AsyncGenerator') {
    const typeRef = type as ts.TypeReference;
    const args = type.aliasTypeArguments ?? typeRef.typeArguments ?? checker.getTypeArguments(typeRef);
    if (args && args.length > 0) {
      const yieldResult = getFailureMembers(args[0], checker, resolvedSettings, context);
      if (yieldResult.defined) {
        return yieldResult;
      }
    }
  }

  // 4. CancelablePromise, AsyncResult, or Failing type arguments (with canc source check!)
  if (
    sym &&
    (symName === 'CancelablePromise' ||
      symName === 'AsyncResult' ||
      symName === 'AsyncGenResult' ||
      symName === 'Failing')
  ) {
    if (
      symbolDeclaredInCancSource(sym, resolvedSettings, checker, context) ||
      isCancelableType(type, checker, resolvedSettings, context)
    ) {
      const typeRef = type as ts.TypeReference;
      const args = type.aliasTypeArguments ?? typeRef.typeArguments ?? checker.getTypeArguments(typeRef);
      const failureArgIndex =
        symName === 'Failing' ? 0
        : symName === 'AsyncGenResult' ? 2
        : 1;
      if (args && args.length > failureArgIndex) {
        return extractFromFailureType(args[failureArgIndex], checker);
      }
    }
  }

  return { listed: [], open: false, defined: false };
}

export function isClassOrSubclass(t: ts.Type, h: ts.Type, checker: ts.TypeChecker): boolean {
  if (t === h) {
    return true;
  }
  const symT = (t as { symbol?: ts.Symbol }).symbol;
  const symH = (h as { symbol?: ts.Symbol }).symbol;
  if (symT && symH && symT === symH) {
    return true;
  }
  if (t.isClassOrInterface()) {
    const baseTypes = checker.getBaseTypes(t);
    for (const base of baseTypes) {
      if (isClassOrSubclass(base, h, checker)) {
        return true;
      }
    }
  }
  return false;
}

function getBrandName(t: ts.Type, checker: ts.TypeChecker): string | undefined {
  const brandProp = t.getProperty('_cancErrorBrand');
  if (brandProp) {
    const decl = brandProp.valueDeclaration ?? brandProp.declarations?.[0];
    const brandType = decl ? checker.getTypeOfSymbolAtLocation(brandProp, decl) : undefined;
    if (brandType?.isStringLiteral()) {
      return brandType.value;
    }
  }
  return undefined;
}

export function failureMatches(source: ts.Type, target: ts.Type, checker: ts.TypeChecker): boolean {
  if (isClassOrSubclass(source, target, checker)) {
    return true;
  }
  const srcBrand = getBrandName(source, checker);
  const tgtBrand = getBrandName(target, checker);
  if (srcBrand && tgtBrand && srcBrand === tgtBrand) {
    return true;
  }
  return false;
}

export function isWidened(source: FailureMembers, target: FailureMembers, checker: ts.TypeChecker): boolean {
  if (!target.defined || target.listed.length === 0) {
    return true;
  }

  for (const srcMember of source.listed) {
    const matched = target.listed.some((tgtMember) => failureMatches(srcMember, tgtMember, checker));
    if (!matched) {
      return true;
    }
  }

  return false;
}

const programFailureSymbolsCache = new WeakMap<ts.Program, Set<ts.Symbol>>();

export function getProgramFailureSymbols(
  program: ts.Program,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context?: Context,
): Set<ts.Symbol> {
  const cached = programFailureSymbolsCache.get(program);
  if (cached) {
    return cached;
  }

  const result = new Set<ts.Symbol>();

  function addFailureTypes(type: ts.Type): void {
    const members = getFailureMembers(type, checker, settings, context);
    for (const mem of members.listed) {
      const sym = mem.aliasSymbol ?? mem.symbol;
      if (sym) {
        result.add(sym);
        if (sym.flags & ts.SymbolFlags.Alias) {
          try {
            const aliased = checker.getAliasedSymbol(sym);
            if (aliased) result.add(aliased);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  function addDirectFailureType(type: ts.Type | undefined): void {
    if (!type) return;
    const types = type.isUnion() ? type.types : [type];
    for (const t of types) {
      const sym = t.aliasSymbol ?? t.symbol;
      if (sym && sym.name !== 'unknown' && sym.name !== 'never') {
        result.add(sym);
        if (sym.flags & ts.SymbolFlags.Alias) {
          try {
            const aliased = checker.getAliasedSymbol(sym);
            if (aliased) result.add(aliased);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) {
      const type = checker.getTypeAtLocation(node);
      addFailureTypes(type);
      const typeName = node.typeName.getText();
      if (
        (typeName === 'CancelablePromise' ||
          typeName === 'LazyPromise' ||
          typeName === 'AsyncResult' ||
          typeName === 'AsyncGenResult') &&
        node.typeArguments &&
        node.typeArguments.length >= 2
      ) {
        const fIndex = typeName === 'AsyncGenResult' ? 2 : 1;
        if (node.typeArguments.length > fIndex) {
          addDirectFailureType(checker.getTypeFromTypeNode(node.typeArguments[fIndex]));
        }
      }
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      if (node.type) {
        addFailureTypes(checker.getTypeFromTypeNode(node.type));
      }
    } else if (ts.isTypeAliasDeclaration(node)) {
      addFailureTypes(checker.getTypeFromTypeNode(node.type));
    } else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
      if (node.type) {
        addFailureTypes(checker.getTypeFromTypeNode(node.type));
      }
      const type = checker.getTypeAtLocation(node);
      addFailureTypes(type);
    } else if (ts.isCallExpression(node)) {
      if (node.typeArguments && node.typeArguments.length > 0) {
        const calleeText = node.expression.getText();
        if (calleeText.includes('withFailure')) {
          for (const arg of node.typeArguments) {
            addDirectFailureType(checker.getTypeFromTypeNode(arg));
          }
        }
      }
      const expr = node.expression;
      let isThrow = false;
      if (ts.isIdentifier(expr)) {
        if (expr.text === 'cancThrow' || expr.text === 'cancGenThrow') {
          isThrow = true;
        }
      } else if (ts.isPropertyAccessExpression(expr)) {
        const prop = expr.name.text;
        const objText = expr.expression.getText();
        if (
          ((objText === 'canc' || objText === 'cancGen') && prop === 'throw') ||
          (objText === 'CancelablePromise' && prop === 'fail')
        ) {
          isThrow = true;
        }
      }
      if (isThrow && node.arguments.length > 0) {
        const argType = checker.getTypeAtLocation(node.arguments[0]);
        addDirectFailureType(argType);
      }

      let isMatcher = false;
      if (ts.isIdentifier(expr)) {
        if (['isErrorOf', 'createIsError', 'withFailure'].includes(expr.text)) {
          isMatcher = true;
        }
      } else if (ts.isPropertyAccessExpression(expr)) {
        if (['isErrorOf', 'createIsError', 'withFailure'].includes(expr.name.text)) {
          isMatcher = true;
        }
      }
      if (isMatcher) {
        for (const arg of node.arguments) {
          const argSym = checker.getSymbolAtLocation(arg);
          if (argSym) {
            result.add(argSym);
            if (argSym.flags & ts.SymbolFlags.Alias) {
              try {
                const aliased = checker.getAliasedSymbol(argSym);
                if (aliased) result.add(aliased);
              } catch {
                // ignore
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  for (const sf of program.getSourceFiles()) {
    if (!sf.isDeclarationFile && !sf.fileName.includes('node_modules')) {
      visit(sf);
    }
  }

  programFailureSymbolsCache.set(program, result);
  return result;
}

export function isClassUsedAsFailureInProgram(classDecl: TSESTree.ClassDeclaration, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const program = services.program;
  const checker = program.getTypeChecker();
  const settings = getCancSettings(context);
  const failureSymbols = getProgramFailureSymbols(program, checker, settings, context);

  const tsNode = services.esTreeNodeToTSNodeMap.get(classDecl);
  if (!tsNode) {
    return false;
  }
  const classSym = checker.getSymbolAtLocation(
    classDecl.id ? services.esTreeNodeToTSNodeMap.get(classDecl.id) : tsNode,
  );
  if (!classSym) {
    return false;
  }

  if (failureSymbols.has(classSym)) {
    return true;
  }
  if (classSym.flags & ts.SymbolFlags.Alias) {
    try {
      const aliased = checker.getAliasedSymbol(classSym);
      if (aliased && failureSymbols.has(aliased)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  const instType = services.getTypeAtLocation(classDecl);
  const instSym = instType.symbol ?? instType.aliasSymbol;
  if (instSym && failureSymbols.has(instSym)) {
    return true;
  }

  return false;
}

export function classHasDiscriminant(classDecl: TSESTree.ClassDeclaration, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return true;
  }
  const checker = services.program.getTypeChecker();
  const instanceType = services.getTypeAtLocation(classDecl);

  for (const member of classDecl.body.body) {
    if (member.type === AST_NODE_TYPES.PropertyDefinition) {
      if (member.static) {
        return true;
      }
      const propKey = member.key;
      let propName: string | undefined;
      if (propKey.type === AST_NODE_TYPES.Identifier) {
        propName = propKey.name;
      } else if (propKey.type === AST_NODE_TYPES.Literal && typeof propKey.value === 'string') {
        propName = propKey.value;
      }

      if (propName === 'message') {
        const tsMember = services.esTreeNodeToTSNodeMap.get(member);
        if (tsMember) {
          const propType = checker.getTypeAtLocation(tsMember);
          if (propType.isStringLiteral() || propType.flags & ts.TypeFlags.StringLiteral) {
            return true;
          }
        }
        continue;
      }
      if (propName === 'name') {
        const tsMember = services.esTreeNodeToTSNodeMap.get(member);
        if (tsMember) {
          const propType = checker.getTypeAtLocation(tsMember);
          if (propType.isStringLiteral() || propType.flags & ts.TypeFlags.StringLiteral) {
            return true;
          }
        }
        continue;
      }
      return true;
    } else if (member.type === AST_NODE_TYPES.AccessorProperty) {
      return true;
    } else if (member.type === AST_NODE_TYPES.MethodDefinition) {
      if (member.kind !== 'constructor') {
        return true;
      }
      if (member.value.params.some((p) => p.type === AST_NODE_TYPES.TSParameterProperty)) {
        return true;
      }
    }
  }

  if (instanceType.isClassOrInterface() || instanceType.flags & ts.TypeFlags.Object) {
    const baseTypes = checker.getBaseTypes(instanceType as ts.InterfaceType);
    for (const base of baseTypes) {
      const sym = base.aliasSymbol ?? base.getSymbol() ?? base.symbol;
      if (sym?.name === 'Error') {
        continue;
      }
      const props = checker.getPropertiesOfType(base);
      for (const p of props) {
        if (p.name !== 'name' && p.name !== 'message' && p.name !== 'stack' && p.name !== 'cause') {
          return true;
        }
        if (p.name === 'name') {
          const decl = p.valueDeclaration ?? p.declarations?.[0];
          if (decl) {
            const pType = checker.getTypeOfSymbolAtLocation(p, decl);
            if (pType.isStringLiteral() || pType.flags & ts.TypeFlags.StringLiteral) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

export function extendsErrorTransitively(classDecl: TSESTree.ClassDeclaration, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(classDecl);

  function checkBase(t: ts.Type, visited = new Set<ts.Type>()): boolean {
    if (visited.has(t)) return false;
    visited.add(t);

    if (t.isClassOrInterface() || t.flags & ts.TypeFlags.Object) {
      const baseTypes = checker.getBaseTypes(t as ts.InterfaceType);
      for (const base of baseTypes) {
        const sym = base.aliasSymbol ?? base.getSymbol() ?? base.symbol;
        if (sym?.name === 'Error') {
          return true;
        }
        if (checkBase(base, visited)) {
          return true;
        }
      }
    }
    return false;
  }

  return checkBase(type);
}

export function formatTypeNames(types: ts.Type[], checker: ts.TypeChecker): string {
  return types
    .map((t) => {
      if (t.aliasSymbol?.name) {
        return t.aliasSymbol.name;
      }
      if (t.symbol?.name && t.symbol.name !== '__type') {
        return t.symbol.name;
      }
      const brandProp = t.getProperty('_cancErrorBrand');
      if (brandProp) {
        const decl = brandProp.valueDeclaration ?? brandProp.declarations?.[0];
        const brandType = decl ? checker.getTypeOfSymbolAtLocation(brandProp, decl) : undefined;
        if (brandType?.isStringLiteral()) {
          const parts = brandType.value.split(':');
          return parts[parts.length - 1];
        }
        const match = /_cancErrorBrand:\s*["'](?:[^"':]+:)?([^"']+)["']/.exec(checker.typeToString(t));
        if (match) {
          return match[1];
        }
      }
      return checker.typeToString(t);
    })
    .join(', ');
}

export function isExcludedClass(
  node: TSESTree.ClassDeclaration,
  context: Context,
  compiledExclude: CompiledMatchers,
): boolean {
  if (compiledExclude.length === 0) {
    return false;
  }
  const name = node.id?.name;
  if (name && matchesName(compiledExclude, name)) {
    return true;
  }
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  return matchesType(compiledExclude, type, services.program.getTypeChecker(), services.program);
}

export function collectHandledCatchTypes(
  catchBody: TSESTree.BlockStatement,
  bindingName: string,
  context: Context,
): ts.Type[] {
  const services = getCancServices(context);
  if (!services?.program) {
    return [];
  }
  const checker = services.program.getTypeChecker();
  const esTreeNodeToTSNodeMap = services.esTreeNodeToTSNodeMap;
  const handled: ts.Type[] = [];

  function visit(node: TSESTree.Node): void {
    if (
      node !== catchBody &&
      (node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      return;
    }

    if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'instanceof') {
      if (node.left.type === AST_NODE_TYPES.Identifier && node.left.name === bindingName) {
        const tsRight = esTreeNodeToTSNodeMap.get(node.right);
        if (tsRight) {
          const rightType = checker.getTypeAtLocation(tsRight);
          const constructs = rightType.getConstructSignatures();
          if (constructs.length > 0) {
            handled.push(constructs[0].getReturnType());
          } else {
            const sym = checker.getSymbolAtLocation(tsRight);
            if (sym) {
              handled.push(checker.getDeclaredTypeOfSymbol(sym));
            }
          }
        }
      }
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      const hasBindingArg = node.arguments.some(
        (arg) => arg.type === AST_NODE_TYPES.Identifier && arg.name === bindingName,
      );

      if (hasBindingArg) {
        const tsCall = esTreeNodeToTSNodeMap.get(node);
        if (tsCall) {
          const sig = checker.getResolvedSignature(tsCall);
          if (sig) {
            const pred = checker.getTypePredicateOfSignature(sig);
            if (pred?.type) {
              if (pred.type.isUnion()) {
                for (const member of pred.type.types) {
                  handled.push(member);
                }
              } else {
                handled.push(pred.type);
              }
            }
          }
        }

        const callee = node.callee;
        if (
          refersTo(callee, context, 'isErrorOf') ||
          refersTo(callee, context, 'catchErrors') ||
          refersTo(callee, context, 'suppressErrors')
        ) {
          for (const arg of node.arguments) {
            if (arg.type !== AST_NODE_TYPES.Identifier || arg.name === bindingName) {
              continue;
            }
            const tsArg = esTreeNodeToTSNodeMap.get(arg);
            if (tsArg) {
              const argType = checker.getTypeAtLocation(tsArg);
              const constructs = argType.getConstructSignatures();
              if (constructs.length > 0) {
                handled.push(constructs[0].getReturnType());
              } else {
                const sym = checker.getSymbolAtLocation(tsArg);
                if (sym) {
                  handled.push(checker.getDeclaredTypeOfSymbol(sym));
                }
              }
            }
          }
        }
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === 'parent') continue;
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              visit(item as TSESTree.Node);
            }
          }
        } else if ('type' in child) {
          visit(child as TSESTree.Node);
        }
      }
    }
  }

  visit(catchBody);
  return handled;
}

export interface CatchAnalysisResult {
  unhandled: ts.Type[];
  handled: ts.Type[];
  isAnyStepOpen: boolean;
  unhandledNames: string;
  handledNames: string;
}

export function analyzeCatchFailures(
  yieldSteps: TSESTree.YieldExpression[],
  handledTypes: ts.Type[],
  compiledExclude: CompiledMatchers,
  context: Context,
): CatchAnalysisResult | null {
  const services = getCancServices(context);
  if (!services?.program) {
    return null;
  }
  const checker = services.program.getTypeChecker();
  const esTreeNodeToTSNodeMap = services.esTreeNodeToTSNodeMap;
  const program = services.program;
  const settings = getCancSettings(context);

  let isAnyStepOpen = false;
  const allListedMap = new Map<string, ts.Type>();

  for (const step of yieldSteps) {
    if (!step.argument) continue;
    const tsArg = esTreeNodeToTSNodeMap.get(step.argument);
    if (!tsArg) continue;
    const stepType = checker.getTypeAtLocation(tsArg);

    let failures = getFailureMembers(stepType, checker, settings, context);

    if (step.argument.type === AST_NODE_TYPES.CallExpression) {
      const arg0 = step.argument.arguments[0];
      if (arg0) {
        const tsArg0 = esTreeNodeToTSNodeMap.get(arg0);
        if (tsArg0) {
          const arg0Type = checker.getTypeAtLocation(tsArg0);
          const arg0Failures = getFailureMembers(arg0Type, checker, settings, context);
          if (arg0Failures.defined) {
            if (!failures.defined) {
              failures = arg0Failures;
            } else {
              if (arg0Failures.open) {
                failures.open = true;
              }
              for (const m of arg0Failures.listed) {
                if (!failures.listed.some((existing) => checker.typeToString(existing) === checker.typeToString(m))) {
                  failures.listed.push(m);
                }
              }
            }
          }
          if (!failures.defined && !arg0Failures.defined && isCancelableType(arg0Type, checker, settings, context)) {
            return null;
          }
        }
      }
    }

    if (!failures.defined && isCancelableType(stepType, checker, settings, context)) {
      return null;
    }

    if (failures.open) {
      isAnyStepOpen = true;
    }

    for (const member of failures.listed) {
      if (!isCancelErrorType(member, checker, settings)) {
        const id = member.symbol?.name ?? checker.typeToString(member);
        if (!allListedMap.has(id)) {
          allListedMap.set(id, member);
        }
      }
    }
  }

  const listedTypes = Array.from(allListedMap.values());
  if (listedTypes.length === 0 && !isAnyStepOpen) {
    return null;
  }

  const isHandled = (t: ts.Type): boolean => {
    if (matchesType(compiledExclude, t, checker, program) || matchesName(compiledExclude, t.symbol?.name)) {
      return true;
    }
    return handledTypes.some(
      (h) =>
        isClassOrSubclass(t, h, checker) ||
        (t.symbol && t.symbol === h.symbol) ||
        (t.symbol?.name && t.symbol.name === h.symbol?.name) ||
        checker.typeToString(t) === checker.typeToString(h),
    );
  };

  const unhandled = listedTypes.filter((t) => !isHandled(t));
  const handled = listedTypes.filter((t) => isHandled(t));

  return {
    unhandled,
    handled,
    isAnyStepOpen,
    unhandledNames: formatTypeNames(unhandled, checker),
    handledNames: formatTypeNames(handled, checker),
  };
}
