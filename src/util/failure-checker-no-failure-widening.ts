import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

import { getCancServices, isCancelableType } from './canc-types.js';
import { getFailureMembers, isWidened } from './failure-types.js';
import { getCancSettings, nominalSettings } from './settings.js';

/** Whether a cancelable source with a defined failure set loses members when seen as the target type. */
export function isFailureWidened(
  sourceNode: TSESTree.Node,
  targetNode: TSESTree.Node,
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
): boolean {
  const services = getCancServices(context);
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const settings = nominalSettings(getCancSettings(context));
  const sourceType = services.getTypeAtLocation(sourceNode);
  if (!isCancelableType(sourceType, checker, settings, context)) {
    return false;
  }
  const sourceFailures = getFailureMembers(sourceType, checker, settings, context);
  if (sourceFailures.listed.length === 0) {
    return false;
  }
  const targetFailures = getFailureMembers(services.getTypeAtLocation(targetNode), checker, settings, context, {
    ignoreNonCarrierBranches: true,
  });
  return isWidened(sourceFailures, targetFailures, checker);
}
