import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type ts from 'typescript';

import createRule from '../util/create-rule.js';
import { type FailureMembers, getFailureMembers } from '../util/failure-types.js';

export type MessageIds = 'failureWidening';

export interface NoFailureWideningOptions {
  allowWithComment?: string;
  allowVariableAnnotationWidening?: boolean;
}

export type RuleOptions = [NoFailureWideningOptions?];

type Context = TSESLint.RuleContext<MessageIds, RuleOptions>;

function isClassOrSubclass(t: ts.Type, h: ts.Type, checker: ts.TypeChecker): boolean {
  if (t === h) {
    return true;
  }
  const symT = (t as { symbol?: ts.Symbol }).symbol;
  const symH = (h as { symbol?: ts.Symbol }).symbol;
  if (symT && symH && symT === symH) {
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

function getBrandName(t: ts.Type, checker: ts.TypeChecker): string | undefined {
  const brandProp = t.getProperty('_cancErrorBrand');
  if (brandProp) {
    const decl = brandProp.valueDeclaration ?? brandProp.declarations?.[0];
    const brandType = decl ? checker.getTypeOfSymbolAtLocation(brandProp, decl) : undefined;
    if (brandType?.isStringLiteral()) {
      return brandType.value;
    }
  }
  return undefined;
}

function failureMatches(source: ts.Type, target: ts.Type, checker: ts.TypeChecker): boolean {
  if (isClassOrSubclass(source, target, checker)) {
    return true;
  }
  const srcBrand = getBrandName(source, checker);
  const tgtBrand = getBrandName(target, checker);
  if (srcBrand && tgtBrand && srcBrand === tgtBrand) {
    return true;
  }
  return false;
}

function isWidened(source: FailureMembers, target: FailureMembers, checker: ts.TypeChecker): boolean {
  if (!target.defined || target.listed.length === 0) {
    return true;
  }

  for (const srcMember of source.listed) {
    const matched = target.listed.some((tgtMember) => failureMatches(srcMember, tgtMember, checker));
    if (!matched) {
      return true;
    }
  }

  return false;
}

function unwrapCastChain(node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion): TSESTree.Expression {
  let curr: TSESTree.Expression = node.expression;
  while (curr.type === AST_NODE_TYPES.TSAsExpression || curr.type === AST_NODE_TYPES.TSTypeAssertion) {
    curr = curr.expression;
  }
  return curr;
}

function hasAllowComment(node: TSESTree.Node, context: Context, marker: string): boolean {
  const sourceCode = context.sourceCode;
  const nodeLine = node.loc.start.line;

  let stmt: TSESTree.Node = node;
  while (
    stmt.parent &&
    stmt.parent.type !== AST_NODE_TYPES.Program &&
    stmt.parent.type !== AST_NODE_TYPES.BlockStatement
  ) {
    stmt = stmt.parent;
  }

  const stmtLine = stmt.loc.start.line;
  const allComments = sourceCode.getAllComments();
  for (const c of allComments) {
    if (c.value.includes(marker)) {
      if (
        c.loc.end.line === nodeLine ||
        c.loc.end.line === nodeLine - 1 ||
        c.loc.end.line === stmtLine ||
        c.loc.end.line === stmtLine - 1
      ) {
        return true;
      }
    }
  }

  return false;
}

function isWithFailureInScope(context: Context, node: TSESTree.Node): boolean {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const v = scope.set.get('withFailure') ?? scope.variables.find((v) => v.name === 'withFailure');
    if (v && v.defs.length > 0) {
      return true;
    }
    scope = scope.upper;
  }
  return false;
}

function getNearestEnclosingFunction(node: TSESTree.Node): TSESTree.FunctionLike | null {
  let curr = node.parent;
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

export default createRule<RuleOptions, MessageIds>({
  name: 'no-failure-widening',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow casts and type annotations that drop declared failure types.',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowWithComment: {
            type: 'string',
            description: 'Comment text that permits failure widening on the adjacent line.',
          },
          allowVariableAnnotationWidening: {
            type: 'boolean',
            description: 'Whether type annotations on variable declarations are allowed to widen failures.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        allowWithComment: 'canc-allow-widening',
        allowVariableAnnotationWidening: true,
      },
    ],
    messages: {
      failureWidening:
        "This {{position}} drops failure types declared by the source promise. Keep them in the target type, or state the change with 'withFailure'.",
    },
  },
  defaultOptions: [
    {
      allowWithComment: 'canc-allow-widening',
      allowVariableAnnotationWidening: true,
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

    const allowWithComment = options?.allowWithComment ?? 'canc-allow-widening';
    const allowVariableWidening = options?.allowVariableAnnotationWidening !== false;

    function checkCast(node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion): void {
      if (node.parent.type === AST_NODE_TYPES.TSAsExpression || node.parent.type === AST_NODE_TYPES.TSTypeAssertion) {
        return;
      }

      // Skip as const
      if (
        node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
        node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
        node.typeAnnotation.typeName.name === 'const'
      ) {
        return;
      }

      // If direct child of a return statement in an annotated function, let the return handler own it
      if (node.parent.type === AST_NODE_TYPES.ReturnStatement) {
        const fn = getNearestEnclosingFunction(node.parent);
        if (fn?.returnType) {
          return;
        }
      }

      if (hasAllowComment(node, context, allowWithComment)) {
        return;
      }

      const innermost = unwrapCastChain(node);
      const tsSource = esTreeNodeToTSNodeMap.get(innermost);
      const sourceType = checker.getTypeAtLocation(tsSource);
      const sourceFailures = getFailureMembers(sourceType, checker);

      if (!sourceFailures.defined || sourceFailures.listed.length === 0) {
        return;
      }

      const tsTarget = esTreeNodeToTSNodeMap.get(node.typeAnnotation);
      const targetType = checker.getTypeAtLocation(tsTarget);
      const targetFailures = getFailureMembers(targetType, checker);

      if (isWidened(sourceFailures, targetFailures, checker)) {
        let replacement: string | undefined;

        if (node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
          let typeName = '';
          if (node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier) {
            typeName = node.typeAnnotation.typeName.name;
          } else if (node.typeAnnotation.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
            typeName = node.typeAnnotation.typeName.right.name;
          }

          if (typeName === 'CancelablePromise' && isWithFailureInScope(context, node)) {
            const typeParams = node.typeAnnotation.typeArguments?.params;
            const failureArg =
              typeParams && typeParams.length >= 2 ? context.sourceCode.getText(typeParams[1]) : 'unknown';
            const exprText = context.sourceCode.getText(innermost);
            replacement = `withFailure<${failureArg}>()(${exprText})`;
          }
        }

        if (replacement) {
          context.report({
            node,
            messageId: 'failureWidening',
            data: { position: 'cast' },
            suggest: [
              {
                messageId: 'failureWidening',
                data: { position: 'cast' },
                fix(fixer) {
                  return fixer.replaceText(node, replacement);
                },
              },
            ],
          });
        } else {
          context.report({
            node,
            messageId: 'failureWidening',
            data: { position: 'cast' },
          });
        }
      }
    }

    return {
      TSAsExpression: checkCast,
      TSTypeAssertion: checkCast,

      ReturnStatement(node) {
        if (!node.argument) {
          return;
        }

        const fn = getNearestEnclosingFunction(node);
        if (!fn?.returnType) {
          return;
        }

        if (hasAllowComment(node, context, allowWithComment)) {
          return;
        }

        const innermost =
          (
            node.argument.type === AST_NODE_TYPES.TSAsExpression ||
            node.argument.type === AST_NODE_TYPES.TSTypeAssertion
          ) ?
            unwrapCastChain(node.argument)
          : node.argument;

        const tsSource = esTreeNodeToTSNodeMap.get(innermost);
        const sourceType = checker.getTypeAtLocation(tsSource);
        const sourceFailures = getFailureMembers(sourceType, checker);

        if (!sourceFailures.defined || sourceFailures.listed.length === 0) {
          return;
        }

        const tsTarget = esTreeNodeToTSNodeMap.get(fn.returnType.typeAnnotation);
        const targetType = checker.getTypeAtLocation(tsTarget);
        const targetFailures = getFailureMembers(targetType, checker);

        if (isWidened(sourceFailures, targetFailures, checker)) {
          context.report({
            node: fn.returnType,
            messageId: 'failureWidening',
            data: { position: 'return type' },
          });
        }
      },

      ArrowFunctionExpression(node) {
        if (node.body.type === AST_NODE_TYPES.BlockStatement || !node.returnType) {
          return;
        }

        if (hasAllowComment(node, context, allowWithComment)) {
          return;
        }

        const innermost =
          node.body.type === AST_NODE_TYPES.TSAsExpression || node.body.type === AST_NODE_TYPES.TSTypeAssertion ?
            unwrapCastChain(node.body)
          : node.body;

        const tsSource = esTreeNodeToTSNodeMap.get(innermost);
        const sourceType = checker.getTypeAtLocation(tsSource);
        const sourceFailures = getFailureMembers(sourceType, checker);

        if (!sourceFailures.defined || sourceFailures.listed.length === 0) {
          return;
        }

        const tsTarget = esTreeNodeToTSNodeMap.get(node.returnType.typeAnnotation);
        const targetType = checker.getTypeAtLocation(tsTarget);
        const targetFailures = getFailureMembers(targetType, checker);

        if (isWidened(sourceFailures, targetFailures, checker)) {
          context.report({
            node: node.returnType,
            messageId: 'failureWidening',
            data: { position: 'return type' },
          });
        }
      },

      VariableDeclarator(node) {
        if (allowVariableWidening || !node.id.typeAnnotation || !node.init) {
          return;
        }

        if (hasAllowComment(node, context, allowWithComment)) {
          return;
        }

        const innermost =
          node.init.type === AST_NODE_TYPES.TSAsExpression || node.init.type === AST_NODE_TYPES.TSTypeAssertion ?
            unwrapCastChain(node.init)
          : node.init;

        const tsSource = esTreeNodeToTSNodeMap.get(innermost);
        const sourceType = checker.getTypeAtLocation(tsSource);
        const sourceFailures = getFailureMembers(sourceType, checker);

        if (!sourceFailures.defined || sourceFailures.listed.length === 0) {
          return;
        }

        const tsTarget = esTreeNodeToTSNodeMap.get(node.id.typeAnnotation.typeAnnotation);
        const targetType = checker.getTypeAtLocation(tsTarget);
        const targetFailures = getFailureMembers(targetType, checker);

        if (isWidened(sourceFailures, targetFailures, checker)) {
          context.report({
            node: node.id.typeAnnotation,
            messageId: 'failureWidening',
            data: { position: 'variable type' },
          });
        }
      },
    };
  },
});
