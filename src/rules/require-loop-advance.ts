import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'missingAdvance' | 'continueBeforeAdvance' | 'suggestAdvanceFirst';
export type RuleOptions = [];

function unwrapParentheses(node: TSESTree.Expression): TSESTree.Expression {
  let curr: TSESTree.Expression = node;
  while (
    curr.type === AST_NODE_TYPES.ChainExpression ||
    curr.type === AST_NODE_TYPES.TSAsExpression ||
    curr.type === AST_NODE_TYPES.TSTypeAssertion ||
    curr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    curr = curr.expression;
  }
  return curr;
}

function isLoopNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement
  );
}

function getLoopLabels(loopNode: TSESTree.ForOfStatement): Set<string> {
  const labels = new Set<string>();
  let curr: TSESTree.Node = loopNode;
  while (curr.parent && curr.parent.type === AST_NODE_TYPES.LabeledStatement) {
    labels.add(curr.parent.label.name);
    curr = curr.parent;
  }
  return labels;
}

function isSingleArgForAwaitCall(
  expr: TSESTree.Expression,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): { isForAwait: boolean; calleeText: string } {
  const unwrapped = unwrapParentheses(expr);
  if (unwrapped.type !== AST_NODE_TYPES.CallExpression || unwrapped.arguments.length !== 1) {
    return { isForAwait: false, calleeText: '' };
  }
  const callee = unwrapped.callee;
  if (refersTo(callee, context, 'cancForAwait') || refersTo(callee, context, 'forAwait')) {
    return { isForAwait: true, calleeText: context.sourceCode.getText(callee) };
  }
  return { isForAwait: false, calleeText: '' };
}

export default createRule<RuleOptions, MessageIds>({
  name: 'require-loop-advance',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require loops over a cancForAwait handle or sugar form to advance the loop',
      requiresTypeChecking: false,
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      missingAdvance:
        "This loop over a cancForAwait handle never advances it. Call 'yield* {{advance}}' as the first statement of the body, or the next iteration throws.",
      continueBeforeAdvance:
        "A 'continue' here skips the advance and the next iteration throws. Move 'yield* {{advance}}' to the top of the loop body.",
      suggestAdvanceFirst: 'Advance at the top of the loop body.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      ForOfStatement(node) {
        let advanceText: string | null = null;
        let handleName: string | null = null;

        const rightExpr = unwrapParentheses(node.right);

        // (a) Sugar loop: `for (const x of yield* cancForAwait(src))`
        if (rightExpr.type === AST_NODE_TYPES.YieldExpression && rightExpr.delegate && rightExpr.argument) {
          const check = isSingleArgForAwaitCall(rightExpr.argument, context);
          if (check.isForAwait) {
            advanceText = `${check.calleeText}.next()`;
          }
        } else if (rightExpr.type === AST_NODE_TYPES.Identifier) {
          // (b) Handle loop: `const loop = yield* cancForAwait(src); for (const x of loop)`
          const scope = sourceCode.getScope(rightExpr);
          let currScope: TSESLint.Scope.Scope | null = scope;
          let variable: TSESLint.Scope.Variable | undefined;
          while (currScope) {
            variable = currScope.variables.find((v) => v.name === rightExpr.name);
            if (variable) break;
            currScope = currScope.upper;
          }

          if (variable && variable.defs.length === 1) {
            const def = variable.defs[0];
            if (
              def.node.type === AST_NODE_TYPES.VariableDeclarator &&
              def.node.parent.type === AST_NODE_TYPES.VariableDeclaration &&
              def.node.parent.kind === 'const' &&
              def.node.init
            ) {
              const initExpr = unwrapParentheses(def.node.init);
              if (initExpr.type === AST_NODE_TYPES.YieldExpression && initExpr.delegate && initExpr.argument) {
                const check = isSingleArgForAwaitCall(initExpr.argument, context);
                if (check.isForAwait) {
                  handleName = rightExpr.name;
                  advanceText = `${handleName}.next()`;
                }
              }
            }
          }
        }

        if (!advanceText) {
          return;
        }

        function isAdvanceStatement(stmt: TSESTree.Statement): stmt is TSESTree.ExpressionStatement {
          if (stmt.type !== AST_NODE_TYPES.ExpressionStatement) return false;
          const expr = stmt.expression;
          if (expr.type !== AST_NODE_TYPES.YieldExpression || !expr.delegate || !expr.argument) return false;
          const call = unwrapParentheses(expr.argument);
          if (call.type !== AST_NODE_TYPES.CallExpression || call.arguments.length !== 0) return false;
          const callee = call.callee;
          if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
          if (callee.property.type !== AST_NODE_TYPES.Identifier || callee.property.name !== 'next') return false;

          if (refersTo(callee.object, context, 'cancForAwait') || refersTo(callee.object, context, 'forAwait')) {
            return true;
          }
          if (handleName && callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === handleName) {
            return true;
          }
          return false;
        }

        const topLevelAdvances: TSESTree.ExpressionStatement[] = [];
        if (node.body.type === AST_NODE_TYPES.BlockStatement) {
          for (const stmt of node.body.body) {
            if (isAdvanceStatement(stmt)) {
              topLevelAdvances.push(stmt);
            }
          }
        }

        const allAdvances: TSESTree.ExpressionStatement[] = [];
        function walkForAdvances(curr: TSESTree.Node) {
          if (
            curr.type === AST_NODE_TYPES.FunctionDeclaration ||
            curr.type === AST_NODE_TYPES.FunctionExpression ||
            curr.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            (curr !== node.body && isLoopNode(curr))
          ) {
            return;
          }

          if (curr.type === AST_NODE_TYPES.ExpressionStatement && isAdvanceStatement(curr)) {
            allAdvances.push(curr);
          }

          for (const key of Object.keys(curr)) {
            if (key === 'parent') continue;
            const val = (curr as unknown as Record<string, unknown>)[key];
            if (val && typeof val === 'object') {
              if (Array.isArray(val)) {
                for (const item of val) {
                  if (item && typeof item === 'object' && 'type' in item) walkForAdvances(item as TSESTree.Node);
                }
              } else if ('type' in val) {
                walkForAdvances(val as TSESTree.Node);
              }
            }
          }
        }
        walkForAdvances(node.body);

        // Case 1: missingAdvance
        if (allAdvances.length === 0) {
          const suggest =
            node.body.type === AST_NODE_TYPES.BlockStatement ?
              [
                {
                  messageId: 'suggestAdvanceFirst' as const,
                  fix(fixer: TSESLint.RuleFixer) {
                    if (node.body.type !== AST_NODE_TYPES.BlockStatement) return null;
                    if (node.body.body.length > 0) {
                      const firstStmt = node.body.body[0];
                      const indent = ' '.repeat(firstStmt.loc.start.column);
                      return fixer.insertTextBefore(firstStmt, `yield* ${advanceText};\n${indent}`);
                    }
                    return fixer.replaceText(node.body, `{\n  yield* ${advanceText};\n}`);
                  },
                },
              ]
            : [];

          context.report({
            node,
            loc: { start: node.loc.start, end: node.right.loc.end },
            messageId: 'missingAdvance',
            data: { advance: advanceText },
            ...(suggest.length > 0 ? { suggest } : {}),
          });
          return;
        }

        // Case 2: continueBeforeAdvance
        const loopLabels = getLoopLabels(node);
        const targetContinues: TSESTree.ContinueStatement[] = [];

        function walkForContinues(curr: TSESTree.Node, inNestedLoop: boolean) {
          if (
            curr.type === AST_NODE_TYPES.FunctionDeclaration ||
            curr.type === AST_NODE_TYPES.FunctionExpression ||
            curr.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            return;
          }

          if (curr.type === AST_NODE_TYPES.ContinueStatement) {
            if (curr.label) {
              if (loopLabels.has(curr.label.name)) {
                targetContinues.push(curr);
              }
            } else if (!inNestedLoop) {
              targetContinues.push(curr);
            }
            return;
          }

          const isNested = inNestedLoop || (curr !== node.body && isLoopNode(curr));

          for (const key of Object.keys(curr)) {
            if (key === 'parent') continue;
            const val = (curr as unknown as Record<string, unknown>)[key];
            if (val && typeof val === 'object') {
              if (Array.isArray(val)) {
                for (const item of val) {
                  if (item && typeof item === 'object' && 'type' in item)
                    walkForContinues(item as TSESTree.Node, isNested);
                }
              } else if ('type' in val) {
                walkForContinues(val as TSESTree.Node, isNested);
              }
            }
          }
        }
        walkForContinues(node.body, false);

        const firstAdvance = allAdvances[0];
        const firstIsTopLevel = topLevelAdvances.length > 0 && topLevelAdvances[0] === firstAdvance;

        for (const continueStmt of targetContinues) {
          const isBefore = continueStmt.range[0] < firstAdvance.range[0];
          const noTopLevel = topLevelAdvances.length === 0;

          if (isBefore || noTopLevel) {
            const suggest =
              firstIsTopLevel && node.body.type === AST_NODE_TYPES.BlockStatement && node.body.body.length > 0 ?
                [
                  {
                    messageId: 'suggestAdvanceFirst' as const,
                    fix(fixer: TSESLint.RuleFixer) {
                      if (node.body.type !== AST_NODE_TYPES.BlockStatement || node.body.body.length === 0) return null;
                      const firstStmt = node.body.body[0];
                      if (firstStmt === firstAdvance) return null;
                      const firstIndent = ' '.repeat(firstStmt.loc.start.column);

                      const lineStart = sourceCode.getIndexFromLoc({ line: firstAdvance.loc.start.line, column: 0 });
                      const textBefore = sourceCode.text.slice(lineStart, firstAdvance.range[0]);
                      let removeStart = firstAdvance.range[0];
                      let removeEnd = firstAdvance.range[1];
                      if (/^\s*$/.test(textBefore)) {
                        removeStart = lineStart;
                        if (sourceCode.text.slice(removeEnd, removeEnd + 2) === '\r\n') {
                          removeEnd += 2;
                        } else if (sourceCode.text[removeEnd] === '\n') {
                          removeEnd += 1;
                        }
                      }

                      return [
                        fixer.removeRange([removeStart, removeEnd]),
                        fixer.insertTextBefore(firstStmt, `yield* ${advanceText};\n${firstIndent}`),
                      ];
                    },
                  },
                ]
              : [];

            context.report({
              node: continueStmt,
              messageId: 'continueBeforeAdvance',
              data: { advance: advanceText },
              ...(suggest.length > 0 ? { suggest } : {}),
            });
          }
        }
      },
    };
  },
});
