import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import { getCancServices } from '../util/canc-types.js';
import { type ClassMatcher, classMatcherSchema, compileMatchers } from '../util/class-matcher.js';
import createRule from '../util/create-rule.js';
import { isTypePredicateCall } from '../util/failure-checker-exhaustive-catch.js';
import { analyzeCatchFailures, collectHandledCatchTypes } from '../util/failure-types.js';

export type MessageIds = 'unhandledFailure' | 'noRethrow' | 'missingUnlistedFallback';

export interface ExhaustiveCatchOptions {
  allowRethrow?: boolean;
  requireUnlistedFallback?: boolean;
  exclude?: ClassMatcher[];
}

export type RuleOptions = [ExhaustiveCatchOptions?];

type Context = TSESLint.RuleContext<MessageIds, RuleOptions>;

function getNearestEnclosingFunction(node: TSESTree.Node): TSESTree.FunctionLike | null {
  let curr: TSESTree.Node | undefined = node.parent;
  while (curr) {
    if (
      curr.type === AST_NODE_TYPES.FunctionDeclaration ||
      curr.type === AST_NODE_TYPES.FunctionExpression ||
      curr.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

function forEachChild(node: TSESTree.Node, fn: (child: TSESTree.Node) => void): void {
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            fn(item as TSESTree.Node);
          }
        }
      } else if ('type' in child) {
        fn(child as TSESTree.Node);
      }
    }
  }
}

function isFunctionNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

/** Whether a catch handler rethrows its binding anywhere, so the steps it guards still reach an outer catch. */
function handlerRethrows(handler: TSESTree.CatchClause, context: Context): boolean {
  if (!handler.param) {
    return false;
  }
  if (handler.param.type !== AST_NODE_TYPES.Identifier) {
    return true;
  }
  const bindingName = handler.param.name;
  let found = false;
  function visit(node: TSESTree.Node): void {
    if (found || isFunctionNode(node)) {
      return;
    }
    if (isRethrowStatement(node as TSESTree.Statement, bindingName, context)) {
      found = true;
      return;
    }
    forEachChild(node, visit);
  }
  visit(handler.body);
  return found;
}

function collectYieldStepsInTry(
  tryBlock: TSESTree.BlockStatement,
  parentTry: TSESTree.TryStatement,
  context: Context,
): TSESTree.YieldExpression[] {
  const steps: TSESTree.YieldExpression[] = [];

  function visit(node: TSESTree.Node): void {
    if (
      node !== tryBlock &&
      (node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      return;
    }

    if (node !== parentTry && node.type === AST_NODE_TYPES.TryStatement) {
      // without a handler, or with one that rethrows, the inner block reaches the outer catch
      if (node.handler) {
        visit(node.handler.body);
      }
      if (!node.handler || handlerRethrows(node.handler, context)) {
        visit(node.block);
      }
      if (node.finalizer) {
        visit(node.finalizer);
      }
      return;
    }

    if (node.type === AST_NODE_TYPES.YieldExpression && node.delegate && node.argument) {
      steps.push(node);
      return;
    }

    forEachChild(node, visit);
  }

  visit(tryBlock);
  return steps;
}

function isRethrowStatement(stmt: TSESTree.Statement, bindingName: string, context: Context): boolean {
  if (stmt.type === AST_NODE_TYPES.ThrowStatement && stmt.argument) {
    if (stmt.argument.type === AST_NODE_TYPES.Identifier && stmt.argument.name === bindingName) {
      return true;
    }
  }

  const expr =
    stmt.type === AST_NODE_TYPES.ExpressionStatement ? stmt.expression
    : stmt.type === AST_NODE_TYPES.ReturnStatement ? stmt.argument
    : null;

  if (expr) {
    if (expr.type === AST_NODE_TYPES.YieldExpression && expr.delegate && expr.argument) {
      if (expr.argument.type === AST_NODE_TYPES.CallExpression) {
        const callee = expr.argument.callee;
        const arg0 = expr.argument.arguments[0];
        if (arg0 && arg0.type === AST_NODE_TYPES.Identifier && arg0.name === bindingName) {
          if (
            refersTo(callee, context, 'cancThrow') ||
            refersTo(callee, context, 'cancGenThrow') ||
            (callee.type === AST_NODE_TYPES.MemberExpression &&
              !callee.computed &&
              callee.property.type === AST_NODE_TYPES.Identifier &&
              callee.property.name === 'throw' &&
              (refersTo(callee.object, context, 'canc') || refersTo(callee.object, context, 'cancGen')))
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

const CANC_GUARD_NAMES = ['isErrorOf', 'isCancelError', 'isAbortError', 'isTimeoutError'];

function isRecognizedGuard(expr: TSESTree.Expression, bindingName: string, context: Context): boolean {
  if (expr.type === AST_NODE_TYPES.BinaryExpression) {
    if (expr.operator === 'instanceof') {
      return expr.left.type === AST_NODE_TYPES.Identifier && expr.left.name === bindingName;
    }
    if (expr.operator === '===' || expr.operator === '==' || expr.operator === '!==' || expr.operator === '!=') {
      if (
        expr.left.type === AST_NODE_TYPES.MemberExpression &&
        expr.left.object.type === AST_NODE_TYPES.Identifier &&
        expr.left.object.name === bindingName
      ) {
        return true;
      }
      if (
        expr.right.type === AST_NODE_TYPES.MemberExpression &&
        expr.right.object.type === AST_NODE_TYPES.Identifier &&
        expr.right.object.name === bindingName
      ) {
        return true;
      }
    }
  }

  if (expr.type === AST_NODE_TYPES.CallExpression) {
    const hasBindingArg = expr.arguments.some(
      (arg) => arg.type === AST_NODE_TYPES.Identifier && arg.name === bindingName,
    );
    if (hasBindingArg) {
      return (
        CANC_GUARD_NAMES.some((name) => refersTo(expr.callee, context, name)) || isTypePredicateCall(expr, context)
      );
    }
  }

  if (expr.type === AST_NODE_TYPES.LogicalExpression) {
    const left = isRecognizedGuard(expr.left, bindingName, context);
    const right = isRecognizedGuard(expr.right, bindingName, context);
    // `||` holds when either side does, so both sides must narrow; `&&` narrows through either side
    return expr.operator === '&&' ? left || right : left && right;
  }

  return false;
}

function containsRethrow(stmt: TSESTree.Statement, bindingName: string, context: Context): boolean {
  return stmt.type === AST_NODE_TYPES.BlockStatement ?
      stmt.body.some((s) => isRethrowStatement(s, bindingName, context))
    : isRethrowStatement(stmt, bindingName, context);
}

function isNegatedGuard(test: TSESTree.Expression, bindingName: string, context: Context): boolean {
  if (test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!') {
    return isRecognizedGuard(test.argument, bindingName, context);
  }
  return (
    test.type === AST_NODE_TYPES.BinaryExpression &&
    (test.operator === '!==' || test.operator === '!=') &&
    isRecognizedGuard(test, bindingName, context)
  );
}

/**
 * `if (!guard(e)) throw e;` or `if (e.kind !== X) throw e;`: everything past it is narrowed to what the guard
 * matches.
 */
function isNegatedGuardRethrow(stmt: TSESTree.IfStatement, bindingName: string, context: Context): boolean {
  return isNegatedGuard(stmt.test, bindingName, context) && containsRethrow(stmt.consequent, bindingName, context);
}

function isBindingMember(expr: TSESTree.Expression, bindingName: string): boolean {
  return (
    expr.type === AST_NODE_TYPES.MemberExpression &&
    expr.object.type === AST_NODE_TYPES.Identifier &&
    expr.object.name === bindingName
  );
}

/** Cases must narrow the binding: `switch (e.kind)`, or `switch (true)` whose cases are all recognized guards. */
function hasGuardCases(stmt: TSESTree.SwitchStatement, bindingName: string, context: Context): boolean {
  if (isBindingMember(stmt.discriminant, bindingName)) {
    return true;
  }
  const isSwitchTrue = stmt.discriminant.type === AST_NODE_TYPES.Literal && stmt.discriminant.value === true;
  return stmt.cases.every((c) => c.test === null || (isSwitchTrue && isRecognizedGuard(c.test, bindingName, context)));
}

function hasDefaultRethrow(stmt: TSESTree.SwitchStatement, bindingName: string, context: Context): boolean {
  if (!hasGuardCases(stmt, bindingName, context)) {
    return false;
  }
  const defaultCase = stmt.cases.find((c) => c.test === null);
  return defaultCase?.consequent.some((s) => containsRethrow(s, bindingName, context)) ?? false;
}

const LOOP_OR_SWITCH = new Set<string>([
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

/** Whether the node can leave the catch body (return, or break/continue past it) without rethrowing. */
function hasSwallowingExit(node: TSESTree.Node, bindingName: string, context: Context, nested: boolean): boolean {
  if (isFunctionNode(node)) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.ReturnStatement) {
    return !isRethrowStatement(node, bindingName, context);
  }
  if (node.type === AST_NODE_TYPES.BreakStatement || node.type === AST_NODE_TYPES.ContinueStatement) {
    return node.label !== null || !nested;
  }
  if (node.type === AST_NODE_TYPES.IfStatement && isRecognizedGuard(node.test, bindingName, context)) {
    // an exit under a guard leaves only for the errors the guard matches
    return node.alternate ? hasSwallowingExit(node.alternate, bindingName, context, nested) : false;
  }
  const childNested = nested || LOOP_OR_SWITCH.has(node.type);
  let found = false;
  forEachChild(node, (child) => {
    found ||= hasSwallowingExit(child, bindingName, context, childNested);
  });
  return found;
}

function hasFallbackInCatch(catchBody: TSESTree.BlockStatement, bindingName: string, context: Context): boolean {
  for (const stmt of catchBody.body) {
    if (isFallbackStatement(stmt, bindingName, context)) {
      return true;
    }
    // an earlier statement that leaves the catch skips the fallback below it
    if (hasSwallowingExit(stmt, bindingName, context, false)) {
      return false;
    }
  }

  return false;
}

function isFallbackStatement(stmt: TSESTree.Statement, bindingName: string, context: Context): boolean {
  if (isRethrowStatement(stmt, bindingName, context)) {
    return true;
  }

  if (stmt.type === AST_NODE_TYPES.SwitchStatement && hasDefaultRethrow(stmt, bindingName, context)) {
    return true;
  }

  if (stmt.type === AST_NODE_TYPES.IfStatement && isNegatedGuardRethrow(stmt, bindingName, context)) {
    return true;
  }

  if (stmt.type === AST_NODE_TYPES.IfStatement) {
    if (isRecognizedGuard(stmt.test, bindingName, context)) {
      if (stmt.alternate) {
        let currAlt: TSESTree.Statement | null = stmt.alternate;
        let allNarrowed = true;
        while (currAlt && currAlt.type === AST_NODE_TYPES.IfStatement) {
          if (!isRecognizedGuard(currAlt.test, bindingName, context)) {
            allNarrowed = false;
            break;
          }
          currAlt = currAlt.alternate;
        }
        if (allNarrowed && currAlt) {
          if (
            currAlt.type === AST_NODE_TYPES.BlockStatement ?
              currAlt.body.some((s) => isRethrowStatement(s, bindingName, context))
            : isRethrowStatement(currAlt, bindingName, context)
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function isBindingShadowed(bindingName: string, catchClause: TSESTree.CatchClause, context: Context): boolean {
  const catchScope = context.sourceCode.getScope(catchClause);
  function checkScope(s: TSESLint.Scope.Scope): boolean {
    if (s !== catchScope) {
      if (s.variables.some((v) => v.name === bindingName)) {
        return true;
      }
    }
    return s.childScopes.some(checkScope);
  }

  return catchScope.childScopes.some(checkScope);
}

export default createRule<RuleOptions, MessageIds>({
  name: 'exhaustive-catch',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require coroutine catch blocks to handle or rethrow all declared failure types.',
      requiresTypeChecking: true,
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowRethrow: {
            type: 'boolean',
            description: 'Whether unconditional rethrowing is considered handling remaining failures.',
          },
          requireUnlistedFallback: {
            type: 'boolean',
            description: 'Whether a fallback rethrow is required for open failure sets.',
          },
          exclude: classMatcherSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        allowRethrow: true,
        requireUnlistedFallback: true,
        exclude: [],
      },
    ],
    messages: {
      unhandledFailure:
        'This catch clause does not handle {{names}} and does not rethrow it. Narrow the error with a matcher guard or rethrow it.',
      noRethrow:
        'This catch clause handles {{handled}} but silently drops {{names}}. Rethrow errors it does not handle.',
      missingUnlistedFallback:
        'The failure set is open, so other errors can still arrive. Rethrow errors that the listed guards do not match.',
    },
  },
  defaultOptions: [
    {
      allowRethrow: true,
      requireUnlistedFallback: true,
      exclude: [],
    },
  ],
  create(context, [options]) {
    const services = getCancServices(context);
    if (!services?.program) {
      return {};
    }

    const compiledExclude = compileMatchers(options?.exclude ?? []);
    const allowRethrow = options?.allowRethrow !== false;
    const requireUnlistedFallback = options?.requireUnlistedFallback !== false;

    return {
      TryStatement(node) {
        if (!node.handler) {
          return;
        }

        const coroutine = getCoroutineContext(node, context);
        if (!coroutine) {
          return;
        }

        const nearestFn = getNearestEnclosingFunction(node);
        if (nearestFn !== coroutine.genFn) {
          return;
        }

        const yieldSteps = collectYieldStepsInTry(node.block, node, context);
        if (yieldSteps.length === 0) {
          return;
        }

        const bindingName =
          node.handler.param && node.handler.param.type === AST_NODE_TYPES.Identifier ?
            node.handler.param.name
          : undefined;

        const handledTypes = bindingName ? collectHandledCatchTypes(node.handler.body, bindingName, context) : [];

        const analysis = analyzeCatchFailures(yieldSteps, handledTypes, compiledExclude, context);
        if (!analysis) {
          return;
        }

        const { unhandled, handled, isAnyStepOpen, unhandledNames, handledNames } = analysis;

        const hasRethrow = bindingName ? hasFallbackInCatch(node.handler.body, bindingName, context) : false;

        if (allowRethrow && hasRethrow) {
          return;
        }

        const canSuggest = bindingName && !hasRethrow && !isBindingShadowed(bindingName, node.handler, context);

        const closeBrace = context.sourceCode.getLastToken(node.handler.body);

        if (unhandled.length > 0) {
          if (handled.length === 0) {
            context.report({
              node: node.handler,
              messageId: 'unhandledFailure',
              data: { names: unhandledNames },
            });
          } else {
            context.report({
              node: node.handler,
              messageId: 'noRethrow',
              data: { names: unhandledNames, handled: handledNames },
              suggest:
                canSuggest && closeBrace ?
                  [
                    {
                      messageId: 'noRethrow',
                      data: { names: unhandledNames, handled: handledNames },
                      fix(fixer) {
                        return fixer.insertTextBefore(closeBrace, `  throw ${bindingName};\n  `);
                      },
                    },
                  ]
                : undefined,
            });
          }
          return;
        }

        if (isAnyStepOpen && requireUnlistedFallback && !hasRethrow) {
          context.report({
            node: node.handler,
            messageId: 'missingUnlistedFallback',
            suggest:
              canSuggest && closeBrace ?
                [
                  {
                    messageId: 'missingUnlistedFallback',
                    fix(fixer) {
                      return fixer.insertTextBefore(closeBrace, `  throw ${bindingName};\n  `);
                    },
                  },
                ]
              : undefined,
          });
        }
      },
    };
  },
});
