import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type ts from 'typescript';

import { getCancBindings, getCoroutineContext } from '../util/canc-imports.js';
import {
  type ClassMatcher,
  classMatcherSchema,
  type CompiledMatchers,
  compileMatchers,
  matchesName,
  matchesType,
} from '../util/class-matcher.js';
import createRule from '../util/create-rule.js';
import { isCancelErrorCtorNode, isCancelErrorType } from '../util/failure-types.js';

export type MessageIds = 'preferCancThrow';

export interface PreferCancThrowOptions {
  requireTypeInfo?: boolean;
  exclude?: ClassMatcher[];
  allowCatchRethrow?: boolean;
}

export type RuleOptions = [PreferCancThrowOptions?];

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

function isCatchBindingRethrow(
  throwNode: TSESTree.ThrowStatement,
  coroutineGenFn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression,
): boolean {
  if (throwNode.argument.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const identName = throwNode.argument.name;

  let curr: TSESTree.Node | undefined = throwNode.parent;
  while (curr && curr !== coroutineGenFn) {
    if (curr.type === AST_NODE_TYPES.CatchClause) {
      if (curr.param?.type === AST_NODE_TYPES.Identifier && curr.param.name === identName) {
        return true;
      }
    }
    curr = curr.parent;
  }
  return false;
}

function findInScopeThrower(
  dialect: 'cancAsync' | 'cancGenAsync',
  context: Parameters<Parameters<typeof createRule<RuleOptions, MessageIds>>[0]['create']>[0],
): string | null {
  const bindings = getCancBindings(context);

  if (dialect === 'cancAsync') {
    for (const [localName, binding] of bindings) {
      if (binding.exported === 'cancThrow' || binding.exported === 'throw') {
        return localName;
      }
    }
    for (const [localName, binding] of bindings) {
      if (binding.exported === 'canc' || (binding.namespace && binding.source.includes('coroutine'))) {
        return `${localName}.throw`;
      }
    }
    return null;
  }

  for (const [localName, binding] of bindings) {
    if (binding.exported === 'cancGenThrow') {
      return localName;
    }
  }
  for (const [localName, binding] of bindings) {
    if (binding.exported === 'cancGen' || (binding.namespace && binding.source.includes('coroutine'))) {
      return `${localName}.throw`;
    }
  }
  return null;
}

function isExcludedThrow(
  argNode: TSESTree.Expression,
  compiledExclude: CompiledMatchers,
  checker?: ts.TypeChecker,
  program?: ts.Program,
  tsNode?: ts.Node,
): boolean {
  if (compiledExclude.length === 0) {
    return false;
  }

  let className: string | undefined;
  if (argNode.type === AST_NODE_TYPES.NewExpression) {
    if (argNode.callee.type === AST_NODE_TYPES.Identifier) {
      className = argNode.callee.name;
    }
  }

  if (className && matchesName(compiledExclude, className)) {
    return true;
  }

  if (checker && program && tsNode) {
    const argType = checker.getTypeAtLocation(tsNode);
    if (matchesType(compiledExclude, argType, checker, program)) {
      return true;
    }
  }

  return false;
}

function isCancelErrorThrow(
  argNode: TSESTree.Expression,
  context: Parameters<Parameters<typeof createRule<RuleOptions, MessageIds>>[0]['create']>[0],
  checker?: ts.TypeChecker,
  tsNode?: ts.Node,
): boolean {
  if (isCancelErrorCtorNode(argNode, context)) {
    return true;
  }

  if (checker && tsNode) {
    const argType = checker.getTypeAtLocation(tsNode);
    if (isCancelErrorType(argType, checker)) {
      return true;
    }
  }

  return false;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-canc-throw',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require yield* canc.throw(...) instead of bare throw in coroutines.',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          requireTypeInfo: {
            type: 'boolean',
            description: 'Whether type information is strictly required to check throws.',
          },
          exclude: classMatcherSchema,
          allowCatchRethrow: {
            type: 'boolean',
            description: 'Whether rethrowing the enclosing catch binding is permitted.',
          },
        },
        additionalProperties: false,
      },
    ],

    defaultOptions: [
      {
        requireTypeInfo: false,
        exclude: [],
        allowCatchRethrow: true,
      },
    ],
    messages: {
      preferCancThrow:
        "This throw is not part of the coroutine's declared failure type. Use 'return yield* {{thrower}}(...)' to declare it, or list the error class in the 'exclude' option if it is a programming error.",
    },
  },
  defaultOptions: [
    {
      requireTypeInfo: false,
      exclude: [],
      allowCatchRethrow: true,
    },
  ],
  create(context, [options]) {
    const parserServices = context.sourceCode.parserServices;
    if (options?.requireTypeInfo && !parserServices?.program) {
      return {};
    }

    const program = parserServices?.program;
    const checker = program ? program.getTypeChecker() : undefined;
    const compiledExclude = compileMatchers(options?.exclude ?? []);
    const allowCatchRethrow = options?.allowCatchRethrow !== false;

    return {
      ThrowStatement(node) {
        const coroutine = getCoroutineContext(node, context);
        if (!coroutine) {
          return;
        }

        const nearestFn = getNearestEnclosingFunction(node);
        if (nearestFn !== coroutine.genFn) {
          return;
        }

        if (allowCatchRethrow && isCatchBindingRethrow(node, coroutine.genFn)) {
          return;
        }

        const tsNode = parserServices?.esTreeNodeToTSNodeMap?.get(node.argument);

        if (isCancelErrorThrow(node.argument, context, checker, tsNode)) {
          return;
        }

        if (isExcludedThrow(node.argument, compiledExclude, checker, program ?? undefined, tsNode)) {
          return;
        }

        const inScopeThrower = findInScopeThrower(coroutine.kind, context);
        const defaultThrower = coroutine.kind === 'cancAsync' ? 'canc.throw' : 'cancGen.throw';
        const displayThrower = inScopeThrower ?? defaultThrower;

        if (inScopeThrower) {
          const argText = context.sourceCode.getText(node.argument);
          context.report({
            node,
            messageId: 'preferCancThrow',
            data: { thrower: displayThrower },
            suggest: [
              {
                messageId: 'preferCancThrow',
                data: { thrower: displayThrower },
                fix(fixer) {
                  return fixer.replaceText(node, `return yield* ${inScopeThrower}(${argText});`);
                },
              },
            ],
          });
        } else {
          context.report({
            node,
            messageId: 'preferCancThrow',
            data: { thrower: displayThrower },
          });
        }
      },
    };
  },
});
