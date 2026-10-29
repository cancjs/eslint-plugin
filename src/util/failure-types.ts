import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

import { refersTo } from './canc-imports.js';
import type { ResolvedCancSettings } from './settings.js';

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

export function isUnlistedMarker(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.getProperty('_cancUnlisted')) {
    return true;
  }
  const props = checker.getPropertiesOfType(type);
  return props.some((p) => p.name === '_cancUnlisted' || String(p.escapedName) === '_cancUnlisted');
}

function findFailureProperty(type: ts.Type, checker: ts.TypeChecker): ts.Symbol | undefined {
  const props = checker.getPropertiesOfType(type);
  for (const prop of props) {
    if (prop.name.includes('FAILURE') || String(prop.escapedName).includes('FAILURE')) {
      return prop;
    }
    if (prop.declarations) {
      for (const d of prop.declarations) {
        if (d.getText().includes('[FAILURE]')) {
          return prop;
        }
      }
    }
  }
  return undefined;
}

export function getFailureMembers(type: ts.Type, checker: ts.TypeChecker): FailureMembers {
  if (type.isUnion()) {
    const results = type.types.map((t) => getFailureMembers(t, checker));
    const anyDefined = results.length > 0 && results.some((r) => r.defined);
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
      defined: anyDefined,
    };
  }

  const failureProp = findFailureProperty(type, checker);
  if (!failureProp) {
    return { listed: [], open: false, defined: false };
  }

  const loc = failureProp.valueDeclaration ?? failureProp.declarations?.[0];
  const failureType = loc ? checker.getTypeOfSymbolAtLocation(failureProp, loc) : undefined;
  if (!failureType) {
    return { listed: [], open: false, defined: false };
  }

  if (failureType.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) {
    return { listed: [], open: false, defined: false };
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
