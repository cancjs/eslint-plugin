import { typeMatchesSpecifier } from '@typescript-eslint/type-utils';
import type { ParserServicesWithTypeInformation } from '@typescript-eslint/typescript-estree';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

import { getCancServices } from '../util/canc-types.js';
import createRule from '../util/create-rule.js';

export interface Options {
  allowedCallees?: string[];
}

export type RuleOptions = [Options?];

export type MessageIds = 'preferSignal' | 'suggestPassSignal' | 'suggestAnnotateSignal';

function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
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

function matchesAbortControllerType(type: ts.Type, program: ts.Program): boolean {
  if (typeMatchesSpecifier(type, { from: 'lib', name: 'AbortController' }, program)) {
    return true;
  }
  if (type.isUnion()) {
    return type.types.some((part) => typeMatchesSpecifier(part, { from: 'lib', name: 'AbortController' }, program));
  }
  return false;
}

function isAbortControllerShadowed(scope: TSESLint.Scope.Scope): boolean {
  let curr: TSESLint.Scope.Scope | null = scope;
  while (curr) {
    const v = curr.variables.find((item) => item.name === 'AbortController');
    if (v && v.defs.length > 0) {
      return true;
    }
    curr = curr.upper;
  }
  return false;
}

function getParamIdentifier(param: TSESTree.Parameter): TSESTree.Identifier | null {
  let target: TSESTree.Node = param;
  if (target.type === AST_NODE_TYPES.TSParameterProperty) {
    target = target.parameter;
  }
  if (target.type === AST_NODE_TYPES.AssignmentPattern) {
    target = target.left;
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return target;
  }
  return null;
}

function getParamTypeAnnotation(param: TSESTree.Parameter, ident: TSESTree.Identifier): TSESTree.TypeNode | undefined {
  if (ident.typeAnnotation?.typeAnnotation) {
    return ident.typeAnnotation.typeAnnotation;
  }
  if ('typeAnnotation' in param && param.typeAnnotation && 'typeAnnotation' in param.typeAnnotation) {
    return param.typeAnnotation.typeAnnotation;
  }
  return undefined;
}

function isAllowedCallee(
  callee: TSESTree.Node,
  allowedCallees: Set<string>,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  if (allowedCallees.size === 0) {
    return false;
  }
  if (callee.type === AST_NODE_TYPES.Identifier && allowedCallees.has(callee.name)) {
    return true;
  }
  const text = context.sourceCode.getText(callee);
  return allowedCallees.has(text);
}

function isAbortControllerNode(
  node: TSESTree.Node,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
  services: ParserServicesWithTypeInformation | null,
): boolean {
  if (services?.program) {
    const type = services.getTypeAtLocation(node);
    return matchesAbortControllerType(type, services.program);
  }

  const scope = context.sourceCode.getScope(node);
  if (isAbortControllerShadowed(scope)) {
    return false;
  }

  const unwrapped = unwrapExpression(node);

  if (
    unwrapped.type === AST_NODE_TYPES.NewExpression &&
    unwrapped.callee.type === AST_NODE_TYPES.Identifier &&
    unwrapped.callee.name === 'AbortController'
  ) {
    return true;
  }

  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    let curr: TSESLint.Scope.Scope | null = scope;
    let variable: TSESLint.Scope.Variable | undefined;
    while (curr) {
      variable = curr.variables.find((v) => v.name === unwrapped.name);
      if (variable) {
        break;
      }
      curr = curr.upper;
    }

    if (!variable) {
      return false;
    }

    for (const def of variable.defs) {
      if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
        const init = unwrapExpression(def.node.init);
        if (
          init.type === AST_NODE_TYPES.NewExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'AbortController'
        ) {
          return true;
        }
      }

      if (def.name.type === AST_NODE_TYPES.Identifier && def.name.typeAnnotation) {
        const typeAnnotation = def.name.typeAnnotation.typeAnnotation;
        if (
          typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
          typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
          typeAnnotation.typeName.name === 'AbortController'
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function isForwardedCallArgument(
  ref: TSESLint.Scope.Reference,
  allowedCallees: Set<string>,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
  services: ParserServicesWithTypeInformation | null,
): boolean {
  const node = ref.identifier;
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const parent = node.parent;
  if (parent.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (!parent.arguments.includes(node)) {
    return false;
  }
  if (
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    isAbortControllerNode(parent.callee.object, context, services)
  ) {
    return false;
  }
  if (isAllowedCallee(parent.callee, allowedCallees, context)) {
    return false;
  }
  return true;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-signal-over-controller',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer passing AbortSignal instead of AbortController.',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowedCallees: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Callee names or member expressions allowed to accept a controller.',
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowedCallees: [] }],
    messages: {
      preferSignal:
        "This code takes or forwards a whole AbortController, which gives the callee the power to abort. Pass 'AbortSignal' instead and keep 'abort()' with the owner.",
      suggestPassSignal: "Pass '{{name}}.signal' instead of the controller.",
      suggestAnnotateSignal: "Change parameter type to 'AbortSignal'.",
    },
  },
  defaultOptions: [{ allowedCallees: [] }],
  create(context) {
    const services = getCancServices(context);
    const options = context.options[0] ?? {};
    const allowedCallees = new Set(options.allowedCallees ?? []);

    function checkFunctionParameters(
      node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
    ): void {
      if (node.parent.type === AST_NODE_TYPES.TSDeclareFunction) {
        return;
      }

      for (const param of node.params) {
        const ident = getParamIdentifier(param);
        if (!ident) {
          continue;
        }

        const scope = context.sourceCode.getScope(ident);
        let matches = false;

        if (services?.program) {
          const type = services.getTypeAtLocation(ident);
          matches = matchesAbortControllerType(type, services.program);
        } else {
          if (!isAbortControllerShadowed(scope)) {
            const typeAnnotation = getParamTypeAnnotation(param, ident);
            if (
              typeAnnotation?.type === AST_NODE_TYPES.TSTypeReference &&
              typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
              typeAnnotation.typeName.name === 'AbortController'
            ) {
              matches = true;
            }
          }
        }

        if (!matches) {
          continue;
        }

        let fnScope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node.body);
        let variable: TSESLint.Scope.Variable | undefined;
        while (fnScope) {
          variable = fnScope.variables.find((v) => v.name === ident.name);
          if (variable) {
            break;
          }
          fnScope = fnScope.upper;
        }

        const references = variable?.references.filter((r) => r.identifier !== ident) ?? [];

        if (references.some((r) => isForwardedCallArgument(r, allowedCallees, context, services))) {
          continue;
        }

        const canSuggest =
          references.length > 0 &&
          references.every((r) => {
            const parent = r.identifier.parent;
            return (
              parent.type === AST_NODE_TYPES.MemberExpression &&
              !parent.computed &&
              parent.object === r.identifier &&
              parent.property.type === AST_NODE_TYPES.Identifier &&
              parent.property.name === 'signal'
            );
          });

        if (canSuggest) {
          context.report({
            node: ident,
            messageId: 'preferSignal',
            suggest: [
              {
                messageId: 'suggestAnnotateSignal',
                fix(fixer) {
                  const fixes: TSESLint.RuleFix[] = [];
                  const typeAnnotation = getParamTypeAnnotation(param, ident);
                  if (typeAnnotation) {
                    fixes.push(fixer.replaceText(typeAnnotation, 'AbortSignal'));
                  } else {
                    fixes.push(fixer.insertTextAfter(ident, ': AbortSignal'));
                  }
                  for (const r of references) {
                    const parent = r.identifier.parent;
                    fixes.push(fixer.replaceText(parent, r.identifier.name));
                  }
                  return fixes;
                },
              },
            ],
          });
        } else {
          context.report({
            node: ident,
            messageId: 'preferSignal',
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkFunctionParameters,
      FunctionExpression: checkFunctionParameters,
      ArrowFunctionExpression: checkFunctionParameters,

      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          isAbortControllerNode(node.callee.object, context, services)
        ) {
          return;
        }

        if (isAllowedCallee(node.callee, allowedCallees, context)) {
          return;
        }

        for (const arg of node.arguments) {
          if (arg.type === AST_NODE_TYPES.SpreadElement) {
            continue;
          }

          if (isAbortControllerNode(arg, context, services)) {
            const argText = context.sourceCode.getText(arg);
            context.report({
              node: arg,
              messageId: 'preferSignal',
              suggest: [
                {
                  messageId: 'suggestPassSignal',
                  data: { name: argText },
                  fix(fixer) {
                    return fixer.replaceText(arg, `${argText}.signal`);
                  },
                },
              ],
            });
          }
        }
      },
    };
  },
});
