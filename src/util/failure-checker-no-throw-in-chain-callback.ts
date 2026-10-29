import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';

import { getCancBindings } from './canc-imports.js';
import { getCancServices } from './canc-types.js';
import { getCancSettings } from './settings.js';

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

/**
 * Whether the checker could not resolve the receiver type (error type) and the type name is the local
 * name of a default import from a canc source. That happens when the default import resolves to the
 * module object, so a receiver annotated `CP<string>` has no usable type.
 */
export function isUnresolvedDefaultImportType(receiver: TSESTree.Node, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const type = services.getTypeAtLocation(receiver);
  if (!(type.flags & ts.TypeFlags.Any)) {
    return false;
  }
  const name = (type.aliasSymbol ?? type.getSymbol())?.name;
  if (!name) {
    return false;
  }
  const settings = getCancSettings(context);
  const binding = getCancBindings(context).get(name);
  return Boolean(binding?.exported === 'default' && settings.sources.includes(binding.source));
}

/** Whether the receiver has an unresolved (any) type, so only its syntax can identify it. */
export function isUnresolvedType(receiver: TSESTree.Node, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  return Boolean(services.getTypeAtLocation(receiver).flags & ts.TypeFlags.Any);
}
