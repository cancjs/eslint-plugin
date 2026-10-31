import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancBindings, getCoroutineContext } from '../util/canc-imports.js';
import { getCancServices } from '../util/canc-types.js';
import {
  type ClassMatcher,
  classMatcherSchema,
  type CompiledMatchers,
  compileMatchers,
  matchesName,
} from '../util/class-matcher.js';
import {
  type FactoryOptions,
  factoryOptionsConstraints,
  factoryOptionsSchema,
  resolveFactories,
} from '../util/coroutine-factories.js';
import createRule from '../util/create-rule.js';
import { isThrownTypeExcluded } from '../util/failure-checker-prefer-canc-throw.js';
import { isCancelErrorThrow } from '../util/failure-types.js';

export type MessageIds = 'preferCancThrow';

export interface PreferCancThrowOptions extends FactoryOptions {
  requireTypeInfo?: boolean;
  exclude?: ClassMatcher[];
  allowCatchRethrow?: boolean;
}

export type RuleOptions = [PreferCancThrowOptions?];

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

function isShadowed(name: string, context: Context, node: TSESTree.Node): boolean {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.variables.find((v) => v.name === name);
    if (variable) {
      return !variable.defs.some(
        (def) =>
          def.node.type === AST_NODE_TYPES.ImportSpecifier ||
          def.node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          def.node.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
      );
    }
    scope = scope.upper;
  }
  return false;
}

function findInScopeThrower(
  dialect: 'cancAsync' | 'cancGenAsync',
  context: Context,
  node: TSESTree.Node,
): string | null {
  const bindings = getCancBindings(context);

  if (dialect === 'cancAsync') {
    for (const [localName, binding] of bindings) {
      if (!binding.source.endsWith('/gen')) {
        if (
          (binding.exported === 'cancThrow' || binding.exported === 'throw') &&
          !isShadowed(localName, context, node)
        ) {
          return localName;
        }
      }
    }
    for (const [localName, binding] of bindings) {
      if (!binding.source.endsWith('/gen')) {
        if (
          (binding.exported === 'canc' || (binding.namespace && binding.source.includes('coroutine'))) &&
          !isShadowed(localName, context, node)
        ) {
          return `${localName}.throw`;
        }
      }
    }
    return null;
  }

  for (const [localName, binding] of bindings) {
    if (binding.source.endsWith('/gen')) {
      if (
        (binding.exported === 'cancGenThrow' || binding.exported === 'throw') &&
        !isShadowed(localName, context, node)
      ) {
        return localName;
      }
    }
  }
  for (const [localName, binding] of bindings) {
    if (binding.source.endsWith('/gen')) {
      if (
        (binding.exported === 'cancGen' || (binding.namespace && binding.source.endsWith('/gen'))) &&
        !isShadowed(localName, context, node)
      ) {
        return `${localName}.throw`;
      }
    }
  }
  return null;
}

function isExcludedThrow(argNode: TSESTree.Expression, compiledExclude: CompiledMatchers, context: Context): boolean {
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

  return isThrownTypeExcluded(argNode, compiledExclude, context);
}

export default createRule<RuleOptions, MessageIds>({
  name: 'prefer-canc-throw',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require yield* canc.throw(...) instead of bare throw in coroutines.',
      requiresTypeChecking: true,
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
          ...factoryOptionsSchema,
        },
        allOf: factoryOptionsConstraints,
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
    const services = getCancServices(context);
    if (options?.requireTypeInfo && !services?.program) {
      return {};
    }

    const factories = resolveFactories(context.options[0]);
    const compiledExclude = compileMatchers(options?.exclude ?? []);
    const allowCatchRethrow = options?.allowCatchRethrow !== false;

    return {
      ThrowStatement(node) {
        const coroutine = getCoroutineContext(node, context, factories);
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

        if (isCancelErrorThrow(node.argument, context)) {
          return;
        }

        if (isExcludedThrow(node.argument, compiledExclude, context)) {
          return;
        }

        const inScopeThrower = findInScopeThrower(coroutine.kind, context, node);
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
