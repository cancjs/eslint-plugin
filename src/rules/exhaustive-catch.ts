import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

import { getCoroutineContext } from '../util/canc-imports.js';
import {
  type ClassMatcher,
  classMatcherSchema,
  compileMatchers,
  matchesName,
  matchesType,
} from '../util/class-matcher.js';
import createRule from '../util/create-rule.js';
import { getFailureMembers, isCancelErrorType } from '../util/failure-types.js';

export type MessageIds = 'unhandledFailure' | 'noRethrow' | 'missingUnlistedFallback';

export interface ExhaustiveCatchOptions {
  allowRethrow?: boolean;
  requireUnlistedFallback?: boolean;
  exclude?: ClassMatcher[];
}

export type RuleOptions = [ExhaustiveCatchOptions?];

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

function collectYieldStepsInTry(
  tryBlock: TSESTree.BlockStatement,
  parentTry: TSESTree.TryStatement,
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

    if (node !== parentTry && node.type === AST_NODE_TYPES.TryStatement && node.handler) {
      return;
    }

    if (node.type === AST_NODE_TYPES.YieldExpression && node.delegate && node.argument) {
      steps.push(node);
      return;
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

  visit(tryBlock);
  return steps;
}

function isCancelablePromiseType(type: ts.Type): boolean {
  const sym = type.aliasSymbol ?? type.getSymbol() ?? type.symbol;
  if (sym && (sym.name === 'CancelablePromise' || sym.name === 'AsyncResult')) {
    return true;
  }
  const props = type.getProperties();
  return props.some(
    (p) =>
      p.name.includes('CANCEL_PROMISE_BRAND') ||
      p.name.includes('FAILURE') ||
      String(p.escapedName).includes('FAILURE'),
  );
}

function isRethrowStatement(stmt: TSESTree.Statement, bindingName: string): boolean {
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
            (callee.type === AST_NODE_TYPES.Identifier &&
              (callee.name === 'cancThrow' || callee.name === 'cancGenThrow')) ||
            (callee.type === AST_NODE_TYPES.MemberExpression &&
              !callee.computed &&
              callee.property.type === AST_NODE_TYPES.Identifier &&
              callee.property.name === 'throw')
          ) {
            return true;
          }
        }
      }
    } else if (expr.type === AST_NODE_TYPES.CallExpression) {
      const callee = expr.callee;
      const calleeName =
        callee.type === AST_NODE_TYPES.Identifier ? callee.name
        : (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier
        ) ?
          callee.property.name
        : '';
      if (calleeName === 'suppressErrors' || calleeName === 'catchErrors') {
        const arg0 = expr.arguments[0];
        if (arg0 && arg0.type === AST_NODE_TYPES.Identifier && arg0.name === bindingName) {
          return true;
        }
      }
    }
  }

  return false;
}

function hasFallbackInCatch(catchBody: TSESTree.BlockStatement, bindingName: string): boolean {
  for (const stmt of catchBody.body) {
    if (isRethrowStatement(stmt, bindingName)) {
      return true;
    }

    if (stmt.type === AST_NODE_TYPES.IfStatement) {
      if (stmt.test.type === AST_NODE_TYPES.UnaryExpression && stmt.test.operator === '!') {
        if (
          stmt.consequent.type === AST_NODE_TYPES.BlockStatement ?
            stmt.consequent.body.some((s) => isRethrowStatement(s, bindingName))
          : isRethrowStatement(stmt.consequent, bindingName)
        ) {
          return true;
        }
      }

      if (stmt.alternate) {
        let currAlt: TSESTree.Statement | null = stmt.alternate;
        while (currAlt && currAlt.type === AST_NODE_TYPES.IfStatement) {
          currAlt = currAlt.alternate;
        }
        if (currAlt) {
          if (
            currAlt.type === AST_NODE_TYPES.BlockStatement ?
              currAlt.body.some((s) => isRethrowStatement(s, bindingName))
            : isRethrowStatement(currAlt, bindingName)
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function collectHandledTypes(
  catchBody: TSESTree.BlockStatement,
  bindingName: string,
  checker: ts.TypeChecker,
  parserServices: { esTreeNodeToTSNodeMap: { get: (node: TSESTree.Node) => ts.Node } },
): ts.Type[] {
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
        const tsRight = parserServices.esTreeNodeToTSNodeMap.get(node.right);
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
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      const hasBindingArg = node.arguments.some(
        (arg) => arg.type === AST_NODE_TYPES.Identifier && arg.name === bindingName,
      );

      if (hasBindingArg) {
        const tsCall = parserServices.esTreeNodeToTSNodeMap.get(node) as ts.CallExpression;
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

        const callee = node.callee;
        const calleeName =
          callee.type === AST_NODE_TYPES.Identifier ? callee.name
          : (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.property.type === AST_NODE_TYPES.Identifier
          ) ?
            callee.property.name
          : '';

        if (calleeName === 'suppressErrors' || calleeName === 'catchErrors' || calleeName === 'isErrorOf') {
          for (const arg of node.arguments) {
            if (arg.type !== AST_NODE_TYPES.Identifier || arg.name === bindingName) {
              continue;
            }
            const tsArg = parserServices.esTreeNodeToTSNodeMap.get(arg);
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

export default createRule<RuleOptions, MessageIds>({
  name: 'exhaustive-catch',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require coroutine catch blocks to handle or rethrow all declared failure types.',
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
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
      return {};
    }

    const program = parserServices.program;
    const esTreeNodeToTSNodeMap = parserServices.esTreeNodeToTSNodeMap;
    const checker = program.getTypeChecker();
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

        const yieldSteps = collectYieldStepsInTry(node.block, node);
        if (yieldSteps.length === 0) {
          return;
        }

        let isAnyStepOpen = false;
        const allListedMap = new Map<string, ts.Type>();

        for (const step of yieldSteps) {
          if (!step.argument) continue;
          const tsArg = esTreeNodeToTSNodeMap.get(step.argument);
          const stepType = checker.getTypeAtLocation(tsArg);

          let failures = getFailureMembers(stepType, checker);

          if (step.argument.type === AST_NODE_TYPES.CallExpression) {
            const arg0 = step.argument.arguments[0];
            if (arg0) {
              const tsArg0 = esTreeNodeToTSNodeMap.get(arg0);
              const arg0Type = checker.getTypeAtLocation(tsArg0);
              const arg0Failures = getFailureMembers(arg0Type, checker);
              if (arg0Failures.defined) {
                if (!failures.defined) {
                  failures = arg0Failures;
                } else {
                  if (arg0Failures.open) {
                    failures.open = true;
                  }
                  for (const m of arg0Failures.listed) {
                    if (
                      !failures.listed.some((existing) => checker.typeToString(existing) === checker.typeToString(m))
                    ) {
                      failures.listed.push(m);
                    }
                  }
                }
              }
              if (!failures.defined && !arg0Failures.defined && isCancelablePromiseType(arg0Type)) {
                return;
              }
            }
          }

          if (!failures.defined && isCancelablePromiseType(stepType)) {
            return;
          }

          if (failures.open) {
            isAnyStepOpen = true;
          }

          for (const member of failures.listed) {
            if (!isCancelErrorType(member, checker)) {
              const id = member.symbol?.name ?? checker.typeToString(member);
              if (!allListedMap.has(id)) {
                allListedMap.set(id, member);
              }
            }
          }
        }

        const listedTypes = Array.from(allListedMap.values());
        if (listedTypes.length === 0 && !isAnyStepOpen) {
          return;
        }

        const bindingName =
          node.handler.param && node.handler.param.type === AST_NODE_TYPES.Identifier ?
            node.handler.param.name
          : undefined;

        const handledTypes =
          bindingName ? collectHandledTypes(node.handler.body, bindingName, checker, { esTreeNodeToTSNodeMap }) : [];

        function isClassOrSubclass(t: ts.Type, h: ts.Type, checker: ts.TypeChecker): boolean {
          if (t.symbol && h.symbol && t.symbol === h.symbol) {
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

        const hasRethrow = bindingName ? hasFallbackInCatch(node.handler.body, bindingName) : false;

        if (allowRethrow && hasRethrow) {
          return;
        }

        const formatNames = (types: ts.Type[]): string =>
          types
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

        const names = formatNames(unhandled);
        const handledNames = formatNames(handled);

        if (unhandled.length > 0) {
          if (handled.length === 0) {
            context.report({
              node: node.handler,
              messageId: 'unhandledFailure',
              data: { names },
            });
          } else {
            const closeBrace = context.sourceCode.getLastToken(node.handler.body);
            context.report({
              node: node.handler,
              messageId: 'noRethrow',
              data: { names, handled: handledNames },
              suggest:
                bindingName && closeBrace ?
                  [
                    {
                      messageId: 'noRethrow',
                      data: { names, handled: handledNames },
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
          const closeBrace = context.sourceCode.getLastToken(node.handler.body);
          context.report({
            node: node.handler,
            messageId: 'missingUnlistedFallback',
            suggest:
              bindingName && closeBrace ?
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
