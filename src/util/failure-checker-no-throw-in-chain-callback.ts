import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';

import { getCancServices } from './canc-types.js';

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

/** Whether the receiver has an unresolved (any) type, so only its syntax can identify it. */
export function isUnresolvedType(receiver: TSESTree.Node, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  return Boolean(services.getTypeAtLocation(receiver).flags & ts.TypeFlags.Any);
}
