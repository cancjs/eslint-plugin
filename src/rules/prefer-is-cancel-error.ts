import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancBindings, refersTo } from '../util/canc-imports.js';
import { getCancServices } from '../util/canc-types.js';
import { isCancelableFlowCatch } from '../util/catch-flow.js';
import createRule from '../util/create-rule.js';
import { getCancSettings, nominalSettings, type ResolvedCancSettings } from '../util/settings.js';

export type MessageIds =
  | 'instanceofCancelError'
  | 'nameCheckCancelError'
  | 'instanceofCancPromise'
  | 'abortErrorWrongLayer'
  | 'preferIsAbortError'
  | 'suggestUseIsCancelError'
  | 'suggestUseIsAbortError';

type Context = TSESLint.RuleContext<MessageIds, []>;

function getUnwrappedExpression(node: TSESTree.Expression): TSESTree.Expression {
  let current: TSESTree.Expression = node;
  for (;;) {
    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
    } else if (current.type === AST_NODE_TYPES.TSAsExpression) {
      current = current.expression;
    } else if (current.type === AST_NODE_TYPES.TSNonNullExpression) {
      current = current.expression;
    } else if (current.type === AST_NODE_TYPES.TSTypeAssertion) {
      current = current.expression;
    } else {
      break;
    }
  }
  return current;
}

function getMemberNameCheck(
  left: TSESTree.Expression,
  right: TSESTree.Expression,
): { member: TSESTree.MemberExpression; expectedName: string } | null {
  const unwrappedLeft = getUnwrappedExpression(left);
  const unwrappedRight = getUnwrappedExpression(right);

  if (isNameMember(unwrappedLeft) && isStringLiteral(unwrappedRight)) {
    return { member: unwrapMember(unwrappedLeft), expectedName: unwrappedRight.value };
  }
  if (isNameMember(unwrappedRight) && isStringLiteral(unwrappedLeft)) {
    return { member: unwrapMember(unwrappedRight), expectedName: unwrappedLeft.value };
  }
  return null;
}

function isNameMember(node: TSESTree.Expression): boolean {
  const unwrapped = node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  return (
    unwrapped.type === AST_NODE_TYPES.MemberExpression &&
    !unwrapped.computed &&
    unwrapped.property.type === AST_NODE_TYPES.Identifier &&
    unwrapped.property.name === 'name'
  );
}

function unwrapMember(node: TSESTree.Expression): TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.ChainExpression ?
      (node.expression as TSESTree.MemberExpression)
    : (node as TSESTree.MemberExpression);
}

function isStringLiteral(node: TSESTree.Expression): node is TSESTree.StringLiteral {
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string';
}

function getFunctionName(
  node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
): string | null {
  if (node.id) {
    return node.id.name;
  }
  const parent = node.parent;
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
    return parent.id.name;
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.key.type === AST_NODE_TYPES.Identifier) {
    return parent.key.name;
  }
  if (parent.type === AST_NODE_TYPES.MethodDefinition && parent.key.type === AST_NODE_TYPES.Identifier) {
    return parent.key.name;
  }
  return null;
}

function isInsideFallbackHelper(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      const name = getFunctionName(current);
      if (name && (name === 'isTimeoutError' || name === 'isAbortError')) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function getEnclosingCatchClause(node: TSESTree.Node): TSESTree.CatchClause | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return null;
    }
    if (current.type === AST_NODE_TYPES.CatchClause) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isCancelableCatch(
  catchClause: TSESTree.CatchClause,
  context: Context,
  settings: ResolvedCancSettings,
): boolean {
  return isCancelableFlowCatch(catchClause, context, settings);
}

function getTrackedImportName(context: Context, exported: string, atNode: TSESTree.Node): string | null {
  const bindings = getCancBindings(context);
  for (const [name, binding] of bindings.entries()) {
    if (!binding.namespace && binding.exported === exported) {
      let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(atNode);
      let shadowed = false;
      while (scope) {
        const variable = scope.variables.find((v) => v.name === name);
        if (variable && variable.defs.length > 0) {
          const isImport = variable.defs.some(
            (def) =>
              def.node.type === AST_NODE_TYPES.ImportSpecifier ||
              def.node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
              def.node.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
          );
          if (!isImport) {
            shadowed = true;
          }
          break;
        }
        scope = scope.upper;
      }
      if (!shadowed) {
        return name;
      }
    }
  }
  return null;
}

function getReplacementRange(node: TSESTree.Node, context: Context): [number, number] {
  const sourceCode = context.sourceCode;
  const tokenBefore = sourceCode.getTokenBefore(node);
  const tokenAfter = sourceCode.getTokenAfter(node);
  if (tokenBefore && tokenAfter && tokenBefore.value === '(' && tokenAfter.value === ')') {
    const parent = node.parent;
    if (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!') {
      return [tokenBefore.range[0], tokenAfter.range[1]];
    }
  }
  return [node.range[0], node.range[1]];
}

interface DomExceptionCheck {
  node: TSESTree.BinaryExpression;
  target: TSESTree.Expression;
}

interface AbortErrorCheck {
  node: TSESTree.BinaryExpression;
  target: TSESTree.Expression;
}

function checkDomException(expr: TSESTree.Expression): DomExceptionCheck | null {
  const unwrapped = getUnwrappedExpression(expr);
  if (
    unwrapped.type === AST_NODE_TYPES.BinaryExpression &&
    unwrapped.operator === 'instanceof' &&
    unwrapped.right.type === AST_NODE_TYPES.Identifier &&
    unwrapped.right.name === 'DOMException'
  ) {
    return { node: unwrapped, target: unwrapped.left };
  }
  return null;
}

function checkAbortErrorName(expr: TSESTree.Expression): AbortErrorCheck | null {
  const unwrapped = getUnwrappedExpression(expr);
  if (
    unwrapped.type === AST_NODE_TYPES.BinaryExpression &&
    (unwrapped.operator === '===' || unwrapped.operator === '==')
  ) {
    const check = getMemberNameCheck(unwrapped.left, unwrapped.right);
    if (check?.expectedName === 'AbortError') {
      return { node: unwrapped, target: check.member.object };
    }
  }
  return null;
}

function getTargetBaseName(node: TSESTree.Expression): string {
  const unwrapped = getUnwrappedExpression(node);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped.name;
  }
  return '';
}

function areSameErrorTarget(a: TSESTree.Expression, b: TSESTree.Expression): boolean {
  const rawA = getTargetBaseName(a);
  const rawB = getTargetBaseName(b);
  return rawA !== '' && rawA === rawB;
}

function getInnerIfStatement(consequent: TSESTree.Statement): TSESTree.IfStatement | null {
  if (consequent.type === AST_NODE_TYPES.IfStatement) {
    return consequent;
  }
  if (consequent.type === AST_NODE_TYPES.BlockStatement && consequent.body.length === 1) {
    const single = consequent.body[0];
    if (single.type === AST_NODE_TYPES.IfStatement) {
      return single;
    }
  }
  return null;
}

function getLogicalAndConjuncts(expr: TSESTree.Expression): TSESTree.Expression[] {
  const unwrapped = getUnwrappedExpression(expr);
  if (unwrapped.type === AST_NODE_TYPES.LogicalExpression && unwrapped.operator === '&&') {
    return [...getLogicalAndConjuncts(unwrapped.left), ...getLogicalAndConjuncts(unwrapped.right)];
  }
  return [unwrapped];
}

function getTargetFromBinaryCheck(node: TSESTree.BinaryExpression): TSESTree.Expression | null {
  if (node.left.type === AST_NODE_TYPES.PrivateIdentifier) {
    return null;
  }
  const nameCheck = getMemberNameCheck(node.left, node.right);
  if (nameCheck) {
    return nameCheck.member.object;
  }
  return null;
}

function isPartOfCompoundCheck(node: TSESTree.BinaryExpression): boolean {
  const target = getTargetFromBinaryCheck(node);
  if (!target) {
    return false;
  }

  // 1. Check logical && chain
  let root: TSESTree.Node = node;
  while (root.parent && root.parent.type === AST_NODE_TYPES.LogicalExpression && root.parent.operator === '&&') {
    root = root.parent;
  }
  if (root.type === AST_NODE_TYPES.LogicalExpression && root.operator === '&&') {
    const conjuncts = getLogicalAndConjuncts(root);
    for (const c of conjuncts) {
      if (c === node) {
        continue;
      }
      const dom = checkDomException(c);
      if (dom && areSameErrorTarget(dom.target, target)) {
        return true;
      }
    }
  }

  // 2. Check nested if statements
  let current: TSESTree.Node = node;
  while (
    current.parent &&
    current.parent.type !== AST_NODE_TYPES.IfStatement &&
    current.parent.type !== AST_NODE_TYPES.Program
  ) {
    current = current.parent;
  }
  if (current.parent && current.parent.type === AST_NODE_TYPES.IfStatement) {
    const ifStmt = current.parent;
    let outer: TSESTree.Node | undefined = ifStmt.parent;
    if (outer && outer.type === AST_NODE_TYPES.BlockStatement) {
      outer = outer.parent;
    }
    if (outer && outer.type === AST_NODE_TYPES.IfStatement) {
      const outerDom = checkDomException(outer.test);
      if (outerDom && areSameErrorTarget(outerDom.target, target)) {
        return true;
      }
    }
    const inner = getInnerIfStatement(ifStmt.consequent);
    if (inner) {
      const innerDom = checkDomException(inner.test);
      if (innerDom && areSameErrorTarget(innerDom.target, target)) {
        return true;
      }
    }
  }
  return false;
}

export default createRule<[], MessageIds>({
  name: 'prefer-is-cancel-error',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer brand-checking functions over instanceof or name checks for cancellation errors',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      instanceofCancelError:
        "'instanceof CancelError' fails across package copies and realms. Use 'isCancelError({{value}})', which checks a shared brand.",
      nameCheckCancelError:
        "A name comparison matches any error called 'CancelError' and misses real ones from another copy. Use 'isCancelError({{value}})'.",
      instanceofCancPromise:
        "'instanceof CancelablePromise' fails across package copies. Use 'isCancPromise({{value}})'.",
      abortErrorWrongLayer:
        "A canceled promise rejects with a CancelError and keeps the AbortError only as its cause, so this check never matches. Use 'isCancelError({{value}})'.",
      preferIsAbortError:
        "Comparing 'name' to 'AbortError' is not a dependable check across realms. Use 'isAbortError({{value}})'.",
      suggestUseIsCancelError: "Use 'isCancelError({{value}})' instead.",
      suggestUseIsAbortError: "Use 'isAbortError({{value}})' instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = getCancServices(context);
    const settings = nominalSettings(getCancSettings(context));
    const sourceCode = context.sourceCode;

    return {
      BinaryExpression(node) {
        if (node.operator === 'instanceof') {
          if (refersTo(node.right, context, 'CancelError')) {
            const value = sourceCode.getText(node.left);
            const trackedName = getTrackedImportName(context, 'isCancelError', node);
            if (trackedName) {
              const range = getReplacementRange(node, context);
              context.report({
                node,
                messageId: 'instanceofCancelError',
                data: { value },
                fix(fixer) {
                  return fixer.replaceTextRange(range, `${trackedName}(${value})`);
                },
              });
            } else {
              context.report({
                node,
                messageId: 'instanceofCancelError',
                data: { value },
              });
            }
            return;
          }

          if (refersTo(node.right, context, 'CancelablePromise')) {
            const value = sourceCode.getText(node.left);
            const trackedName = getTrackedImportName(context, 'isCancPromise', node);
            if (trackedName) {
              const range = getReplacementRange(node, context);
              context.report({
                node,
                messageId: 'instanceofCancPromise',
                data: { value },
                fix(fixer) {
                  return fixer.replaceTextRange(range, `${trackedName}(${value})`);
                },
              });
            } else {
              context.report({
                node,
                messageId: 'instanceofCancPromise',
                data: { value },
              });
            }
            return;
          }
          return;
        }

        const isEq = node.operator === '===' || node.operator === '==';
        const isNeq = node.operator === '!==' || node.operator === '!=';
        if (!isEq && !isNeq) {
          return;
        }

        const nameCheck = getMemberNameCheck(node.left, node.right);
        if (!nameCheck) {
          return;
        }

        if (nameCheck.expectedName === 'CancelError') {
          if (isInsideFallbackHelper(node)) {
            return;
          }
          const value = sourceCode.getText(nameCheck.member.object);
          const replacement = isNeq ? `!isCancelError(${value})` : `isCancelError(${value})`;
          context.report({
            node,
            messageId: 'nameCheckCancelError',
            data: { value },
            suggest: [
              {
                messageId: 'suggestUseIsCancelError',
                data: { value },
                fix(fixer) {
                  return fixer.replaceText(node, replacement);
                },
              },
            ],
          });
          return;
        }

        if (nameCheck.expectedName === 'AbortError') {
          if (isPartOfCompoundCheck(node) || isInsideFallbackHelper(node)) {
            return;
          }
          const value = sourceCode.getText(nameCheck.member.object);
          const replacement = isNeq ? `!isAbortError(${value})` : `isAbortError(${value})`;
          context.report({
            node,
            messageId: 'preferIsAbortError',
            data: { value },
            suggest: [
              {
                messageId: 'suggestUseIsAbortError',
                data: { value },
                fix(fixer) {
                  return fixer.replaceText(node, replacement);
                },
              },
            ],
          });
        }
      },

      SwitchStatement(node) {
        if (!isNameMember(node.discriminant)) {
          return;
        }
        const member = unwrapMember(node.discriminant);
        const value = sourceCode.getText(member.object);

        for (const caseNode of node.cases) {
          if (caseNode.test && isStringLiteral(caseNode.test) && caseNode.test.value === 'CancelError') {
            if (isInsideFallbackHelper(caseNode)) {
              continue;
            }
            context.report({
              node: caseNode,
              messageId: 'nameCheckCancelError',
              data: { value },
            });
          }
        }
      },

      LogicalExpression(node) {
        if (node.operator !== '&&') {
          return;
        }

        const leftUnwrapped = getUnwrappedExpression(node.left);
        const rightUnwrapped = getUnwrappedExpression(node.right);
        const leftDom = checkDomException(leftUnwrapped);
        const rightAbort = checkAbortErrorName(rightUnwrapped);
        const leftAbort = checkAbortErrorName(leftUnwrapped);
        const rightDom = checkDomException(rightUnwrapped);

        let domCheck: DomExceptionCheck | null = null;
        let abortCheck: AbortErrorCheck | null = null;

        if (leftDom && rightAbort) {
          domCheck = leftDom;
          abortCheck = rightAbort;
        } else if (leftAbort && rightDom) {
          domCheck = rightDom;
          abortCheck = leftAbort;
        }

        if (domCheck && abortCheck && areSameErrorTarget(domCheck.target, abortCheck.target)) {
          if (!services) {
            return;
          }

          const enclosingCatch = getEnclosingCatchClause(node);
          if (!enclosingCatch || !isCancelableCatch(enclosingCatch, context, settings)) {
            return;
          }

          const value = sourceCode.getText(abortCheck.target);
          context.report({
            node,
            messageId: 'abortErrorWrongLayer',
            data: { value },
            suggest: [
              {
                messageId: 'suggestUseIsCancelError',
                data: { value },
                fix(fixer) {
                  return fixer.replaceText(node, `isCancelError(${value})`);
                },
              },
            ],
          });
          return;
        }

        // Handle chained && expressions when node is the root of an && chain
        const isRootOfAndChain = !(
          node.parent.type === AST_NODE_TYPES.LogicalExpression && node.parent.operator === '&&'
        );
        if (isRootOfAndChain) {
          const conjuncts = getLogicalAndConjuncts(node);
          if (conjuncts.length > 2) {
            let chainDom: DomExceptionCheck | null = null;
            let chainAbort: AbortErrorCheck | null = null;
            for (const c of conjuncts) {
              if (!chainDom) {
                const dom = checkDomException(c);
                if (dom) {
                  chainDom = dom;
                  continue;
                }
              }
              if (!chainAbort) {
                const abort = checkAbortErrorName(c);
                if (abort) {
                  chainAbort = abort;
                  continue;
                }
              }
            }

            if (chainDom && chainAbort && areSameErrorTarget(chainDom.target, chainAbort.target)) {
              if (!services) {
                return;
              }

              const enclosingCatch = getEnclosingCatchClause(node);
              if (!enclosingCatch || !isCancelableCatch(enclosingCatch, context, settings)) {
                return;
              }

              const value = sourceCode.getText(chainAbort.target);
              context.report({
                node: chainAbort.node,
                messageId: 'abortErrorWrongLayer',
                data: { value },
              });
            }
          }
        }
      },

      IfStatement(node) {
        const innerIf = getInnerIfStatement(node.consequent);
        if (!innerIf) {
          return;
        }

        const outerDom = checkDomException(node.test);
        const innerAbort = checkAbortErrorName(innerIf.test);
        const outerAbort = checkAbortErrorName(node.test);
        const innerDom = checkDomException(innerIf.test);

        let domCheck: DomExceptionCheck | null = null;
        let abortCheck: AbortErrorCheck | null = null;

        if (outerDom && innerAbort) {
          domCheck = outerDom;
          abortCheck = innerAbort;
        } else if (outerAbort && innerDom) {
          domCheck = innerDom;
          abortCheck = outerAbort;
        }

        if (!domCheck || !abortCheck || !areSameErrorTarget(domCheck.target, abortCheck.target)) {
          return;
        }

        if (!services) {
          return;
        }

        const enclosingCatch = getEnclosingCatchClause(node);
        if (!enclosingCatch || !isCancelableCatch(enclosingCatch, context, settings)) {
          return;
        }

        const value = sourceCode.getText(abortCheck.target);
        context.report({
          node: innerIf.test,
          messageId: 'abortErrorWrongLayer',
          data: { value },
        });
      },
    };
  },
});
