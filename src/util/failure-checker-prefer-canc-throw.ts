import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

import { getCancServices } from './canc-types.js';
import { type CompiledMatchers, matchesType } from './class-matcher.js';

/** Whether the type of a thrown expression matches one of the compiled `exclude` matchers. */
export function isThrownTypeExcluded(
  argNode: TSESTree.Expression,
  compiledExclude: CompiledMatchers,
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const argType = services.getTypeAtLocation(argNode);
  return matchesType(compiledExclude, argType, services.program.getTypeChecker(), services.program);
}
