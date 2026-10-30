import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'manualSignalWiring' | 'preAbortCheck' | 'addSignalOption';
export type RuleOptions = [];

function unwrapParens(node: TSESTree.Node): TSESTree.Node {
  let curr = node;
  while (
    curr.type === AST_NODE_TYPES.TSAsExpression ||
    curr.type === AST_NODE_TYPES.TSTypeAssertion ||
    curr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    curr = curr.expression;
  }
  return curr;
}

function findVariable(
  node: TSESTree.Identifier,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): TSESLint.Scope.Variable | undefined {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const v = scope.variables.find((item) => item.name === node.name);
    if (v) {
      return v;
    }
    scope = scope.upper;
  }
  return undefined;
}

function isDescendant(child: TSESTree.Node, parent: TSESTree.Node): boolean {
  let curr: TSESTree.Node | undefined = child;
  while (curr) {
    if (curr === parent) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function isExternalSignal(
  node: TSESTree.Identifier,
  executor: TSESTree.FunctionLike,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  const variable = findVariable(node, context);
  if (!variable) {
    return false;
  }

  // If variable is declared inside the executor, it is local
  for (const def of variable.defs) {
    if (isDescendant(def.node, executor)) {
      return false;
    }
  }

  // If variable is an executor parameter, it is local
  if (variable.defs.some((d) => d.node === executor)) {
    return false;
  }

  return true;
}

function branchRejectsOrReturns(consequent: TSESTree.Statement, rejectNames: Set<string>): boolean {
  let found = false;

  function scan(node: TSESTree.Node): void {
    if (found) return;
    if (node.type === AST_NODE_TYPES.ReturnStatement || node.type === AST_NODE_TYPES.ThrowStatement) {
      found = true;
      return;
    }
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrapParens(node.callee);
      if (callee.type === AST_NODE_TYPES.Identifier && rejectNames.has(callee.name)) {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              scan(item as TSESTree.Node);
            }
          }
        } else if ('type' in child) {
          scan(child as TSESTree.Node);
        }
      }
    }
  }

  scan(consequent);
  return found;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-signal-option',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer passing signal as constructor option over manual wiring or pre-abort check inside executor.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      manualSignalWiring:
        "Listening for 'abort' on '{{signal}}' inside the executor repeats the 'signal' option. Pass '{ signal: {{signal}} }' as a constructor option, which also removes the listener when the promise settles.",
      preAbortCheck:
        "Checking '{{signal}}.aborted' by hand repeats what the 'signal' option does at construction. Pass '{ signal: {{signal}} }' instead.",
      addSignalOption: "Pass '{ signal: {{signal}} }' as a constructor option.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      NewExpression(node) {
        const shape = analyzeExecutor(node, context);
        if (!shape) {
          return;
        }

        const executor = shape.executor;
        if (!executor.body) {
          return;
        }

        const optionsArg = node.arguments[1];
        let canSuggest = false;
        let suggestInsert: ((signalName: string, fixer: TSESLint.RuleFixer) => TSESLint.RuleFix | null) | null = null;

        if (node.arguments.length === 1) {
          canSuggest = true;
          suggestInsert = (signalName, fixer) =>
            fixer.insertTextAfter(node.arguments[0], `, { signal: ${signalName} }`);
        } else if (optionsArg && optionsArg.type === AST_NODE_TYPES.ObjectExpression) {
          const hasSignal = optionsArg.properties.some(
            (p) =>
              p.type === AST_NODE_TYPES.Property && p.key.type === AST_NODE_TYPES.Identifier && p.key.name === 'signal',
          );
          if (!hasSignal) {
            canSuggest = true;
            if (optionsArg.properties.length === 0) {
              suggestInsert = (signalName, fixer) => fixer.replaceText(optionsArg, `{ signal: ${signalName} }`);
            } else {
              suggestInsert = (signalName, fixer) =>
                fixer.insertTextBefore(optionsArg.properties[0], `signal: ${signalName}, `);
            }
          }
        }

        function buildSuggestions(signalName: string): TSESLint.SuggestionReportDescriptor<MessageIds>[] | undefined {
          if (!canSuggest || !suggestInsert) {
            return undefined;
          }
          return [
            {
              messageId: 'addSignalOption',
              data: { signal: signalName },
              fix(fixer: TSESLint.RuleFixer) {
                return suggestInsert(signalName, fixer);
              },
            },
          ];
        }

        const rejectNames = new Set<string>(['reject', 'rej']);
        if (shape.params.reject?.type === AST_NODE_TYPES.Identifier) {
          rejectNames.add(shape.params.reject.name);
        }

        function checkNode(curr: TSESTree.Node, insideNestedFn: boolean = false): void {
          const isNestedFn =
            insideNestedFn ||
            (curr !== executor &&
              (curr.type === AST_NODE_TYPES.FunctionExpression ||
                curr.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                curr.type === AST_NODE_TYPES.FunctionDeclaration));

          if (curr.type === AST_NODE_TYPES.CallExpression) {
            let callee = unwrapParens(curr.callee);
            if (callee.type === AST_NODE_TYPES.ChainExpression) {
              callee = unwrapParens(callee.expression);
            }
            if (
              callee.type === AST_NODE_TYPES.MemberExpression &&
              !callee.computed &&
              callee.property.type === AST_NODE_TYPES.Identifier &&
              callee.property.name === 'addEventListener'
            ) {
              const arg0 = curr.arguments[0];
              if (
                arg0 &&
                arg0.type === AST_NODE_TYPES.Literal &&
                arg0.value === 'abort' &&
                callee.object.type === AST_NODE_TYPES.Identifier
              ) {
                const signalIdent = callee.object;
                if (isExternalSignal(signalIdent, executor, context)) {
                  context.report({
                    node: curr,
                    messageId: 'manualSignalWiring',
                    data: { signal: signalIdent.name },
                    suggest: buildSuggestions(signalIdent.name),
                  });
                }
              }
            }
          } else if (curr.type === AST_NODE_TYPES.IfStatement) {
            let test = unwrapParens(curr.test);
            if (test.type === AST_NODE_TYPES.ChainExpression) {
              test = unwrapParens(test.expression);
            }
            let signalIdent: TSESTree.Identifier | null = null;
            if (
              test.type === AST_NODE_TYPES.MemberExpression &&
              !test.computed &&
              test.property.type === AST_NODE_TYPES.Identifier &&
              test.property.name === 'aborted' &&
              test.object.type === AST_NODE_TYPES.Identifier
            ) {
              signalIdent = test.object;
            } else if (test.type === AST_NODE_TYPES.BinaryExpression) {
              const left = unwrapParens(test.left);
              const right = unwrapParens(test.right);
              for (const side of [left, right]) {
                const unwrapSide = side.type === AST_NODE_TYPES.ChainExpression ? unwrapParens(side.expression) : side;
                if (
                  unwrapSide.type === AST_NODE_TYPES.MemberExpression &&
                  !unwrapSide.computed &&
                  unwrapSide.property.type === AST_NODE_TYPES.Identifier &&
                  unwrapSide.property.name === 'aborted' &&
                  unwrapSide.object.type === AST_NODE_TYPES.Identifier
                ) {
                  signalIdent = unwrapSide.object;
                  break;
                }
              }
            }

            if (!isNestedFn && signalIdent && isExternalSignal(signalIdent, executor, context)) {
              if (branchRejectsOrReturns(curr.consequent, rejectNames)) {
                context.report({
                  node: curr,
                  messageId: 'preAbortCheck',
                  data: { signal: signalIdent.name },
                  suggest: buildSuggestions(signalIdent.name),
                });
              }
            }
          }

          for (const key of Object.keys(curr)) {
            if (key === 'parent') continue;
            const child = (curr as unknown as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
              if (Array.isArray(child)) {
                for (const item of child) {
                  if (item && typeof item === 'object' && 'type' in item) {
                    checkNode(item as TSESTree.Node, isNestedFn);
                  }
                }
              } else if ('type' in child) {
                checkNode(child as TSESTree.Node, isNestedFn);
              }
            }
          }
        }

        checkNode(executor.body);
      },
    };
  },
});
