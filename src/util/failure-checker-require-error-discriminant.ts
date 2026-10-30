import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

import { getCancServices, symbolDeclaredInCancSource } from './canc-types.js';
import { type CompiledClassMatcherOptions, isIncluded } from './class-matcher.js';
import { getFailureMembers, isCancelErrorType } from './failure-types.js';
import { getCancSettings, type ResolvedCancSettings } from './settings.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const RESULT_TYPE_NAMES = ['AsyncResult', 'AsyncGenResult'];
const THROW_NAMES = ['cancThrow', 'cancGenThrow', 'throw', 'fail'];
const MATCHER_NAMES = ['isErrorOf', 'createIsError', 'withFailure'];

function resolveAlias(sym: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  if (sym.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(sym);
    } catch {
      return sym;
    }
  }
  return sym;
}

function addSymbol(result: Set<ts.Symbol>, sym: ts.Symbol | undefined, checker: ts.TypeChecker): void {
  if (!sym) {
    return;
  }
  result.add(sym);
  const target = resolveAlias(sym, checker);
  if (target !== sym) {
    result.add(target);
  }
}

/** Name of a canc export the node resolves to, or undefined when it is a local or foreign symbol. */
function cancExportName(
  node: ts.Node,
  names: readonly string[],
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
): string | undefined {
  const sym = checker.getSymbolAtLocation(node);
  if (!sym || !symbolDeclaredInCancSource(sym, settings, checker)) {
    return undefined;
  }
  const target = resolveAlias(sym, checker);
  return names.includes(target.name) ? target.name : undefined;
}

function calleeNameNode(expr: ts.Expression): ts.Node {
  return ts.isPropertyAccessExpression(expr) ? expr.name : expr;
}

function collectFailureSymbols(
  program: ts.Program,
  checker: ts.TypeChecker,
  settings: ResolvedCancSettings,
  context: Context,
): Set<ts.Symbol> {
  const result = new Set<ts.Symbol>();
  const carrierNames = [...settings.cancelableTypeNames, ...settings.lazyTypeNames, ...RESULT_TYPE_NAMES];

  function addDeclaredMembers(type: ts.Type): void {
    for (const member of getFailureMembers(type, checker, settings, context).listed) {
      addSymbol(result, member.aliasSymbol ?? member.symbol, checker);
    }
  }

  function addDirectType(type: ts.Type): void {
    for (const part of type.isUnion() ? type.types : [type]) {
      const sym = part.aliasSymbol ?? part.symbol;
      if (sym && sym.name !== 'unknown' && sym.name !== 'never') {
        addSymbol(result, sym, checker);
      }
    }
  }

  function visitTypeReference(node: ts.TypeReferenceNode): void {
    addDeclaredMembers(checker.getTypeAtLocation(node));
    const carrier = cancExportName(node.typeName, carrierNames, checker, settings);
    if (!carrier || !node.typeArguments) {
      return;
    }
    const failureIndex = carrier === 'AsyncGenResult' ? 2 : 1;
    const failureArg = node.typeArguments[failureIndex] as ts.TypeNode | undefined;
    if (failureArg) {
      addDirectType(checker.getTypeFromTypeNode(failureArg));
    }
  }

  function visitCall(node: ts.CallExpression): void {
    const nameNode = calleeNameNode(node.expression);
    if (cancExportName(nameNode, THROW_NAMES, checker, settings) && node.arguments.length > 0) {
      addDirectType(checker.getTypeAtLocation(node.arguments[0]));
    }
    const matcher = cancExportName(nameNode, MATCHER_NAMES, checker, settings);
    if (!matcher) {
      return;
    }
    if (matcher === 'withFailure' && node.typeArguments) {
      for (const arg of node.typeArguments) {
        addDirectType(checker.getTypeFromTypeNode(arg));
      }
    }
    for (const arg of node.arguments) {
      addSymbol(result, checker.getSymbolAtLocation(arg), checker);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) {
      visitTypeReference(node);
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      if (node.type) {
        addDeclaredMembers(checker.getTypeFromTypeNode(node.type));
      }
    } else if (ts.isTypeAliasDeclaration(node)) {
      addDeclaredMembers(checker.getTypeFromTypeNode(node.type));
    } else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
      if (node.type) {
        addDeclaredMembers(checker.getTypeFromTypeNode(node.type));
      }
      addDeclaredMembers(checker.getTypeAtLocation(node));
    } else if (ts.isCallExpression(node)) {
      visitCall(node);
    }
    ts.forEachChild(node, visit);
  }

  for (const sf of program.getSourceFiles()) {
    if (!sf.isDeclarationFile && !sf.fileName.includes('node_modules')) {
      visit(sf);
    }
  }
  return result;
}

// keyed by settings too: per-file settings may change sources or carrier names in one program
const failureSymbolsCache = new WeakMap<ts.Program, Map<string, Set<ts.Symbol>>>();

function getFailureSymbols(program: ts.Program, settings: ResolvedCancSettings, context: Context): Set<ts.Symbol> {
  let bySettings = failureSymbolsCache.get(program);
  if (!bySettings) {
    bySettings = new Map();
    failureSymbolsCache.set(program, bySettings);
  }
  const key = JSON.stringify([settings.sources, settings.cancelableTypeNames, settings.lazyTypeNames]);
  let symbols = bySettings.get(key);
  if (!symbols) {
    symbols = collectFailureSymbols(program, program.getTypeChecker(), settings, context);
    bySettings.set(key, symbols);
  }
  return symbols;
}

/**
 * Whether the class is used as a failure anywhere in the program: a member of a declared failure set,
 * an argument of a canc matcher, or the argument of a canc throw helper. Callees and carrier types
 * count only when they resolve to declarations in a configured canc source.
 */
export function isClassUsedAsCancFailure(classDecl: TSESTree.ClassDeclaration, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program || !classDecl.id) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const symbols = getFailureSymbols(services.program, getCancSettings(context), context);
  const classSym = checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(classDecl.id));
  if (classSym && (symbols.has(classSym) || symbols.has(resolveAlias(classSym, checker)))) {
    return true;
  }
  const instanceType = services.getTypeAtLocation(classDecl);
  const instanceSym = instanceType.symbol as ts.Symbol | undefined;
  return instanceSym !== undefined && symbols.has(instanceSym);
}

function memberName(key: TSESTree.Expression | TSESTree.PrivateIdentifier): string | undefined {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return undefined;
}

const ERROR_BASE_PROPS = ['name', 'message', 'stack', 'cause'];

/**
 * Whether instances of the class carry a member that tells them apart from other error classes.
 * Static members live on the constructor, not on instances, so they never count.
 */
export function classHasInstanceDiscriminant(classDecl: TSESTree.ClassDeclaration, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return true;
  }
  const checker = services.program.getTypeChecker();

  for (const member of classDecl.body.body) {
    if (
      member.type === AST_NODE_TYPES.PropertyDefinition ||
      member.type === AST_NODE_TYPES.TSAbstractPropertyDefinition
    ) {
      if (member.static) {
        continue;
      }
      const name = memberName(member.key);
      if (name === 'message' || name === 'name') {
        if (services.getTypeAtLocation(member).isStringLiteral()) {
          return true;
        }
        continue;
      }
      return true;
    }
    if (member.type === AST_NODE_TYPES.AccessorProperty || member.type === AST_NODE_TYPES.TSAbstractAccessorProperty) {
      if (!member.static) {
        return true;
      }
    } else if (
      member.type === AST_NODE_TYPES.MethodDefinition ||
      member.type === AST_NODE_TYPES.TSAbstractMethodDefinition
    ) {
      if (member.kind === 'constructor') {
        if (member.value.params.some((p) => p.type === AST_NODE_TYPES.TSParameterProperty)) {
          return true;
        }
      } else if (!member.static) {
        return true;
      }
    }
  }

  const instanceType = services.getTypeAtLocation(classDecl);
  if (!instanceType.isClassOrInterface()) {
    return false;
  }
  for (const base of checker.getBaseTypes(instanceType)) {
    const sym = base.aliasSymbol ?? base.getSymbol();
    if (sym?.name === 'Error') {
      continue;
    }
    for (const prop of checker.getPropertiesOfType(base)) {
      if (!ERROR_BASE_PROPS.includes(prop.name)) {
        return true;
      }
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (prop.name === 'name' && decl && checker.getTypeOfSymbolAtLocation(prop, decl).isStringLiteral()) {
        return true;
      }
    }
  }
  return false;
}

/** Whether the class instance type is a canc CancelError (canc classes carry brands). */
export function isCancelErrorClass(classDecl: TSESTree.ClassDeclaration, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  return isCancelErrorType(services.getTypeAtLocation(classDecl), services.program.getTypeChecker());
}

/** Whether the include/exclude matchers select this class. */
export function isClassSelected(
  options: CompiledClassMatcherOptions,
  classDecl: TSESTree.ClassDeclaration & { id: TSESTree.Identifier },
  context: Context,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const program = services.program;
  const checker = program.getTypeChecker();
  const type = services.getTypeAtLocation(classDecl);
  return isIncluded(options, { name: classDecl.id.name, type, checker, program }, checker, program);
}
