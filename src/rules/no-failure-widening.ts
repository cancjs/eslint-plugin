import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancBindings } from '../util/canc-imports.js';
import { getCancServices } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { isFailureWidened } from '../util/failure-checker-no-failure-widening.js';

export type MessageIds = 'failureWidening';

export interface NoFailureWideningOptions {
  allowWithComment?: string;
  allowVariableAnnotationWidening?: boolean;
}

export type RuleOptions = [NoFailureWideningOptions?];

type Context = TSESLint.RuleContext<MessageIds, RuleOptions>;

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

function getWithFailureName(context: Context, node: TSESTree.Node): string | undefined {
  const bindings = getCancBindings(context);
  for (const [localName, binding] of bindings) {
    if (
      binding.exported === 'withFailure' &&
      (binding.source === '@cancjs/promise' || binding.source.includes('canc-promise'))
    ) {
      let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
      let isShadowed = false;
      while (scope) {
        const v = scope.variables.find((v) => v.name === localName);
        if (v && !v.defs.some((d) => d.node.type === AST_NODE_TYPES.ImportSpecifier)) {
          isShadowed = true;
          break;
        }
        scope = scope.upper;
      }
      if (!isShadowed) {
        return localName;
      }
    }
  }
  return undefined;
}

function getCancelablePromiseName(context: Context, node: TSESTree.Node): string {
  // the alias only matches a type annotation, so a type-only import counts
  const bindings = getCancBindings(context, { includeTypeOnly: true });
  for (const [localName, binding] of bindings) {
    if (
      (binding.exported === 'CancelablePromise' || binding.exported === 'default') &&
      (binding.source === '@cancjs/promise' || binding.source.includes('canc-promise'))
    ) {
      let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
      let isShadowed = false;
      while (scope) {
        const v = scope.variables.find((v) => v.name === localName);
        if (
          v &&
          !v.defs.some(
            (d) =>
              d.node.type === AST_NODE_TYPES.ImportSpecifier || d.node.type === AST_NODE_TYPES.ImportDefaultSpecifier,
          )
        ) {
          isShadowed = true;
          break;
        }
        scope = scope.upper;
      }
      if (!isShadowed) {
        return localName;
      }
    }
  }
  return 'CancelablePromise';
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
      requiresTypeChecking: true,
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
    const services = getCancServices(context);
    if (!services?.program || !services.esTreeNodeToTSNodeMap) {
      return {};
    }

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

      if (hasAllowComment(node, context, allowWithComment)) {
        return;
      }

      const innermost = unwrapCastChain(node);

      if (isFailureWidened(innermost, node.typeAnnotation, context)) {
        let replacement: string | undefined;

        if (node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
          let typeName = '';
          if (node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier) {
            typeName = node.typeAnnotation.typeName.name;
          } else if (node.typeAnnotation.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
            typeName = node.typeAnnotation.typeName.right.name;
          }

          const cpName = getCancelablePromiseName(context, node);
          const wfName = getWithFailureName(context, node);

          if ((typeName === 'CancelablePromise' || typeName === cpName) && wfName) {
            const typeParams = node.typeAnnotation.typeArguments?.params;
            const failureArg =
              typeParams && typeParams.length >= 2 ? context.sourceCode.getText(typeParams[1]) : 'unknown';
            const exprText = context.sourceCode.getText(innermost);
            replacement = `${wfName}<${failureArg}>()(${exprText})`;
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

        // If the return argument is already a cast, checkCast checks it
        if (
          node.argument.type === AST_NODE_TYPES.TSAsExpression ||
          node.argument.type === AST_NODE_TYPES.TSTypeAssertion
        ) {
          return;
        }

        const fn = getNearestEnclosingFunction(node);
        if (!fn?.returnType) {
          return;
        }

        if (hasAllowComment(node, context, allowWithComment)) {
          return;
        }

        if (isFailureWidened(node.argument, fn.returnType.typeAnnotation, context)) {
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

        // If concise body is a cast, checkCast checks it
        if (node.body.type === AST_NODE_TYPES.TSAsExpression || node.body.type === AST_NODE_TYPES.TSTypeAssertion) {
          return;
        }

        if (hasAllowComment(node, context, allowWithComment)) {
          return;
        }

        if (isFailureWidened(node.body, node.returnType.typeAnnotation, context)) {
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

        // If initializer is a cast, checkCast checks it
        if (node.init.type === AST_NODE_TYPES.TSAsExpression || node.init.type === AST_NODE_TYPES.TSTypeAssertion) {
          return;
        }

        if (hasAllowComment(node, context, allowWithComment)) {
          return;
        }

        if (isFailureWidened(node.init, node.id.typeAnnotation.typeAnnotation, context)) {
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
