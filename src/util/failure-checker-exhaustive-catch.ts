import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

import { getCancServices } from './canc-types.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** Whether the call resolves to a signature declaring a type predicate (`x is T`). */
export function isTypePredicateCall(call: TSESTree.CallExpression, context: Context): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const tsCall = services.esTreeNodeToTSNodeMap.get(call);
  const checker = services.program.getTypeChecker();
  const signature = checker.getResolvedSignature(tsCall);
  if (!signature) {
    return false;
  }
  return checker.getTypePredicateOfSignature(signature)?.type !== undefined;
}
