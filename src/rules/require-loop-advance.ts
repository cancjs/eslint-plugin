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

type LoopNode =
  | TSESTree.ForOfStatement
  | TSESTree.ForInStatement
  | TSESTree.ForStatement
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement;

function isLoopNode(node: TSESTree.Node): node is LoopNode {
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
        "This loop over a cancForAwait handle can finish an iteration without advancing it. Call 'yield* {{advance}}' as the first statement of the body, or the next iteration throws.",
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
        let handleVariable: TSESLint.Scope.Variable | null = null;

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
                  handleVariable = variable;
                  advanceText = `${rightExpr.name}.next()`;
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
          if (
            handleVariable &&
            callee.object.type === AST_NODE_TYPES.Identifier &&
            handleVariable.references.some((ref) => ref.identifier === callee.object)
          ) {
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

        const loopLabels = getLoopLabels(node);

        type BreakTarget = { type: 'switch'; switchLabels: ReadonlySet<string> } | { type: 'label'; name: string };

        function canBreakToTargetUnadvanced(curr: TSESTree.Node, target: BreakTarget): boolean {
          if (
            curr.type === AST_NODE_TYPES.FunctionDeclaration ||
            curr.type === AST_NODE_TYPES.FunctionExpression ||
            curr.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            return false;
          }

          if (curr.type === AST_NODE_TYPES.BreakStatement) {
            if (target.type === 'switch') {
              return curr.label === null || (curr.label ? target.switchLabels.has(curr.label.name) : false);
            }
            return curr.label !== null && curr.label.name === target.name;
          }

          if (target.type === 'switch' && (isLoopNode(curr) || curr.type === AST_NODE_TYPES.SwitchStatement)) {
            return false;
          }

          if (curr.type === AST_NODE_TYPES.BlockStatement) {
            for (const s of curr.body) {
              if (canBreakToTargetUnadvanced(s, target)) {
                return true;
              }
              if (!canFallThroughUnadvanced(s, target.type === 'switch', false, new Set())) {
                return false;
              }
            }
            return false;
          }

          if (curr.type === AST_NODE_TYPES.IfStatement) {
            if (canBreakToTargetUnadvanced(curr.consequent, target)) {
              return true;
            }
            if (curr.alternate && canBreakToTargetUnadvanced(curr.alternate, target)) {
              return true;
            }
            return false;
          }

          if (curr.type === AST_NODE_TYPES.TryStatement) {
            if (
              curr.finalizer &&
              !canFallThroughUnadvanced(curr.finalizer, target.type === 'switch', false, new Set())
            ) {
              return false;
            }
            if (canBreakToTargetUnadvanced(curr.block, target)) {
              return true;
            }
            if (curr.handler && canBreakToTargetUnadvanced(curr.handler.body, target)) {
              return true;
            }
            if (curr.finalizer && canBreakToTargetUnadvanced(curr.finalizer, target)) {
              return true;
            }
            return false;
          }

          if (curr.type === AST_NODE_TYPES.SwitchStatement) {
            for (const c of curr.cases) {
              for (const s of c.consequent) {
                if (canBreakToTargetUnadvanced(s, target)) {
                  return true;
                }
                if (!canFallThroughUnadvanced(s, true, false, new Set())) {
                  break;
                }
              }
            }
            return false;
          }

          if (curr.type === AST_NODE_TYPES.LabeledStatement) {
            if (target.type === 'label' && curr.label.name === target.name) {
              return false;
            }
            return canBreakToTargetUnadvanced(curr.body, target);
          }

          if (isLoopNode(curr)) {
            return canBreakToTargetUnadvanced(curr.body, target);
          }

          return false;
        }

        function sequenceCanFallThroughUnadvanced(
          stmts: readonly TSESTree.Statement[],
          nearestIsSwitch: boolean,
          inNestedLoop: boolean,
          innerLabels: ReadonlySet<string>,
        ): boolean {
          for (const s of stmts) {
            if (!canFallThroughUnadvanced(s, nearestIsSwitch, inNestedLoop, innerLabels)) {
              return false;
            }
          }
          return true;
        }

        function canFallThroughUnadvanced(
          stmt: TSESTree.Statement,
          nearestIsSwitch: boolean,
          inNestedLoop: boolean,
          innerLabels: ReadonlySet<string>,
        ): boolean {
          if (isAdvanceStatement(stmt)) {
            return false;
          }
          if (stmt.type === AST_NODE_TYPES.ReturnStatement || stmt.type === AST_NODE_TYPES.ThrowStatement) {
            return false;
          }
          if (stmt.type === AST_NODE_TYPES.ContinueStatement) {
            return false;
          }
          if (stmt.type === AST_NODE_TYPES.BreakStatement) {
            if (stmt.label === null) {
              if (!nearestIsSwitch && !inNestedLoop) {
                return false;
              }
              return true;
            }
            if (!innerLabels.has(stmt.label.name)) {
              return false;
            }
            return true;
          }
          if (stmt.type === AST_NODE_TYPES.BlockStatement) {
            return sequenceCanFallThroughUnadvanced(stmt.body, nearestIsSwitch, inNestedLoop, innerLabels);
          }
          if (stmt.type === AST_NODE_TYPES.LabeledStatement) {
            const nextLabels = new Set(innerLabels);
            nextLabels.add(stmt.label.name);
            if (canBreakToTargetUnadvanced(stmt.body, { type: 'label', name: stmt.label.name })) {
              return true;
            }
            return canFallThroughUnadvanced(stmt.body, nearestIsSwitch, inNestedLoop, nextLabels);
          }
          if (stmt.type === AST_NODE_TYPES.IfStatement) {
            if (!stmt.alternate) {
              return true;
            }
            return (
              canFallThroughUnadvanced(stmt.consequent, nearestIsSwitch, inNestedLoop, innerLabels) ||
              canFallThroughUnadvanced(stmt.alternate, nearestIsSwitch, inNestedLoop, innerLabels)
            );
          }
          if (stmt.type === AST_NODE_TYPES.SwitchStatement) {
            if (!stmt.cases.some((c) => c.test === null)) {
              return true;
            }
            const switchLabels = new Set<string>();
            let p: TSESTree.Node | undefined = stmt.parent;
            while (p && p.type === AST_NODE_TYPES.LabeledStatement) {
              switchLabels.add(p.label.name);
              p = p.parent;
            }
            const target: BreakTarget = { type: 'switch', switchLabels };

            for (let idx = 0; idx < stmt.cases.length; idx++) {
              let caseSafe = false;
              for (let k = idx; k < stmt.cases.length; k++) {
                let broken = false;
                for (const s of stmt.cases[k].consequent) {
                  if (canBreakToTargetUnadvanced(s, target)) {
                    return true;
                  }
                  if (!canFallThroughUnadvanced(s, true, inNestedLoop, innerLabels)) {
                    caseSafe = true;
                    broken = true;
                    break;
                  }
                }
                if (broken) {
                  break;
                }
              }
              if (!caseSafe) {
                return true;
              }
            }
            return false;
          }
          if (stmt.type === AST_NODE_TYPES.TryStatement) {
            if (
              stmt.finalizer &&
              !canFallThroughUnadvanced(stmt.finalizer, nearestIsSwitch, inNestedLoop, innerLabels)
            ) {
              return false;
            }
            return (
              canFallThroughUnadvanced(stmt.block, nearestIsSwitch, inNestedLoop, innerLabels) ||
              (stmt.handler ?
                canFallThroughUnadvanced(stmt.handler.body, nearestIsSwitch, inNestedLoop, innerLabels)
              : false)
            );
          }
          return true;
        }

        // Case 1: missingAdvance
        if (canFallThroughUnadvanced(node.body, false, false, new Set())) {
          const suggest =
            allAdvances.length === 0 && node.body.type === AST_NODE_TYPES.BlockStatement ?
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

        function isContinueDominatedByAdvance(continueStmt: TSESTree.ContinueStatement): boolean {
          let child: TSESTree.Node = continueStmt;
          let parent: TSESTree.Node | undefined = child.parent;
          while (child !== node.body && parent) {
            if (parent.type === AST_NODE_TYPES.BlockStatement) {
              const idx = parent.body.indexOf(child as TSESTree.Statement);
              if (idx > 0 && !sequenceCanFallThroughUnadvanced(parent.body.slice(0, idx), false, false, new Set())) {
                return true;
              }
            } else if (parent.type === AST_NODE_TYPES.SwitchCase) {
              const idx = parent.consequent.indexOf(child as TSESTree.Statement);
              if (
                idx > 0 &&
                !sequenceCanFallThroughUnadvanced(parent.consequent.slice(0, idx), true, false, new Set())
              ) {
                return true;
              }
            }
            child = parent;
            parent = child.parent;
          }
          return false;
        }

        const firstAdvance = allAdvances[0] as TSESTree.ExpressionStatement | undefined;
        const firstIsTopLevel = topLevelAdvances.length > 0 && topLevelAdvances[0] === firstAdvance;

        for (const continueStmt of targetContinues) {
          if (!isContinueDominatedByAdvance(continueStmt)) {
            const canRelocate =
              allAdvances.length === 1 &&
              firstIsTopLevel &&
              continueStmt.range[0] < firstAdvance.range[0] &&
              node.body.type === AST_NODE_TYPES.BlockStatement &&
              node.body.body.length > 0;

            const suggest =
              canRelocate ?
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
