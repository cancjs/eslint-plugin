import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type ts from 'typescript';

import { getCancServices } from './canc-types.js';
import type { CompiledMatchers } from './class-matcher.js';
import { analyzeCatchFailures, type CatchAnalysisResult, formatTypeNames } from './failure-types.js';

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

export interface CatchStep {
  step: TSESTree.YieldExpression;
  /** Types an inner handler around the step keeps before rethrowing the rest to the outer catch. */
  innerHandled: ts.Type[];
}

/**
 * Like `analyzeCatchFailures`, but a step wrapped by a rethrowing inner handler only brings the failures that handler
 * passes on.
 */
export function analyzeCatchSteps(
  steps: CatchStep[],
  handledTypes: ts.Type[],
  compiledExclude: CompiledMatchers,
  context: Context,
): CatchAnalysisResult | null {
  const full = analyzeCatchFailures(
    steps.map((s) => s.step),
    handledTypes,
    compiledExclude,
    context,
  );
  const services = getCancServices(context);
  if (!full || !services?.program || steps.every((s) => s.innerHandled.length === 0)) {
    return full;
  }
  const checker = services.program.getTypeChecker();
  const keyOf = (t: ts.Type): string => t.getSymbol()?.name ?? checker.typeToString(t);

  const groups = new Map<ts.Type[], TSESTree.YieldExpression[]>();
  for (const { step, innerHandled } of steps) {
    const group = groups.get(innerHandled);
    if (group) {
      group.push(step);
    } else {
      groups.set(innerHandled, [step]);
    }
  }

  const unhandledByKey = new Map<string, ts.Type>();
  for (const [innerHandled, groupSteps] of groups) {
    const result = analyzeCatchFailures(groupSteps, [...handledTypes, ...innerHandled], compiledExclude, context);
    for (const t of result?.unhandled ?? []) {
      if (!unhandledByKey.has(keyOf(t))) {
        unhandledByKey.set(keyOf(t), t);
      }
    }
  }

  const unhandled = full.unhandled.filter((t) => unhandledByKey.has(keyOf(t)));
  const handled = full.handled.filter((t) => !unhandledByKey.has(keyOf(t)));
  return {
    unhandled,
    handled,
    isAnyStepOpen: full.isAnyStepOpen,
    unhandledNames: formatTypeNames(unhandled, checker),
    handledNames: formatTypeNames(handled, checker),
  };
}
