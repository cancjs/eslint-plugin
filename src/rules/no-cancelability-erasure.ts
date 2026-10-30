import { type TypeOrValueSpecifier, typeOrValueSpecifiersSchema } from '@typescript-eslint/type-utils';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, TSESLint as ESLintScope } from '@typescript-eslint/utils';

import { getAdoptedOperand, getAdoptionForm, isGlobalPromiseIdent } from '../util/adoption.js';
import {
  getCancServices,
  isCancDeclaredCallee,
  isCancelableExpression,
  isLazyExpression,
  isPlainPromiseContextualSink,
  isPlainPromiseReturnSink,
  sinkMatchesSomeSpecifier,
} from '../util/canc-types.js';
import createRule from '../util/create-rule.js';
import { hasRetainedHandle } from '../util/retained-handle.js';
import { getCancSettings } from '../util/settings.js';

export type MessageIds =
  'erasedArgument' | 'erasedReturn' | 'erasedReturnAsync' | 'erasedAssignment' | 'erasedProperty';

export interface Options {
  allowExplicitWrap?: boolean;
  allowAsCast?: boolean;
  allowAnnotationWidening?: boolean;
  allowForKnownSafeSinks?: TypeOrValueSpecifier[];
  checkArguments?: boolean;
  checkReturns?: boolean;
  checkAssignments?: boolean;
  checkProperties?: boolean;
  retainedHandle?: boolean;
}

export type RuleOptions = [Options];

const { DefinitionType } = ESLintScope.Scope;

const COMBINATOR_METHODS = new Set(['all', 'race', 'any', 'allSettled']);

const FIX_HINT =
  'Keep the cancelable type in the signature, keep a cancel handle in scope, or adopt it explicitly with Promise.resolve(...) or a cast.';

const ASYNC_FIX_HINT =
  'Drop async and return the cancelable, adopt it explicitly with Promise.resolve(...) or a cast, or keep a cancel handle in scope.';

function isFunctionLike(node: TSESTree.Node): node is TSESTree.FunctionLike {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isCallLike(node: TSESTree.Node | undefined): node is TSESTree.CallExpression | TSESTree.NewExpression {
  return node?.type === AST_NODE_TYPES.CallExpression || node?.type === AST_NODE_TYPES.NewExpression;
}

function isPromiseCombinatorCall(node: TSESTree.CallExpression | TSESTree.NewExpression, context: Context): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    COMBINATOR_METHODS.has(callee.property.name) &&
    isGlobalPromiseIdent(callee.object, context)
  );
}

type Context = TSESLint.RuleContext<string, readonly unknown[]>;

export default createRule<[Options], MessageIds>({
  name: 'no-cancelability-erasure',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing or returning cancelable promises where plain promises are expected',
      requiresTypeChecking: true,
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowExplicitWrap: {
            type: 'boolean',
            description: 'Accept Promise.resolve(x) and new Promise((resolve) => resolve(x)) as deliberate adoptions.',
          },
          allowAsCast: {
            type: 'boolean',
            description: 'Accept as, angle-bracket and JSDoc casts to a promise type as deliberate adoptions.',
          },
          allowAnnotationWidening: {
            type: 'boolean',
            description: 'Accept a plain promise annotation on a variable, assignment target or class field.',
          },
          allowForKnownSafeSinks: typeOrValueSpecifiersSchema,
          checkArguments: { type: 'boolean', description: 'Check call and new expression arguments.' },
          checkReturns: { type: 'boolean', description: 'Check return statements and arrow function bodies.' },
          checkAssignments: {
            type: 'boolean',
            description: 'Check annotated variables, reassignments and annotated array elements.',
          },
          checkProperties: {
            type: 'boolean',
            description: 'Check object literal properties, class fields and member assignments.',
          },
          retainedHandle: {
            type: 'boolean',
            description: 'Skip local variables with a visible cancel path in the same function.',
          },
        },
      },
    ],
    defaultOptions: [
      {
        allowExplicitWrap: true,
        allowAsCast: true,
        allowAnnotationWidening: false,
        allowForKnownSafeSinks: [],
        checkArguments: true,
        checkReturns: true,
        checkAssignments: true,
        checkProperties: true,
        retainedHandle: true,
      },
    ],
    messages: {
      erasedArgument: `Cancelability erasure: this cancelable promise is passed to a parameter typed as a plain promise, so the receiver cannot cancel it and the work keeps running after the caller stops. ${FIX_HINT}`,
      erasedReturn: `Cancelability erasure: this cancelable promise is returned through a plain promise return type, so callers lose the cancel handle. ${FIX_HINT}`,
      erasedReturnAsync: `Cancelability erasure: this cancelable promise is returned from an async function, whose result is always a plain promise, so callers lose the cancel handle. ${ASYNC_FIX_HINT}`,
      erasedAssignment: `Cancelability erasure: this cancelable promise is stored under a plain promise type, so later code cannot cancel it. ${FIX_HINT}`,
      erasedProperty: `Cancelability erasure: this cancelable promise is stored in a property typed as a plain promise, so readers of the property cannot cancel it. ${FIX_HINT}`,
    },
  },
  defaultOptions: [
    {
      allowExplicitWrap: true,
      allowAsCast: true,
      allowAnnotationWidening: false,
      allowForKnownSafeSinks: [],
      checkArguments: true,
      checkReturns: true,
      checkAssignments: true,
      checkProperties: true,
      retainedHandle: true,
    },
  ],
  create(context, [options]) {
    if (!getCancServices(context)) {
      return {};
    }

    const settings = getCancSettings(context);
    const safeSinks = options.allowForKnownSafeSinks ?? [];

    function initializerIsAllowedAdoption(identifier: TSESTree.Identifier): boolean {
      let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
          const def = variable.defs[0];
          if (
            def?.type !== DefinitionType.Variable ||
            def.parent?.type !== AST_NODE_TYPES.VariableDeclaration ||
            def.parent.kind !== 'const' ||
            !def.node.init
          ) {
            return false;
          }
          return isAllowedForm(getAdoptionForm(def.node.init, context));
        }
        scope = scope.upper;
      }
      return false;
    }

    function isAllowedForm(form: ReturnType<typeof getAdoptionForm>): boolean {
      return (
        form === 'boundary' ||
        (form === 'explicitWrap' && options.allowExplicitWrap !== false) ||
        (form === 'asCast' && options.allowAsCast !== false)
      );
    }

    // expression whose cancelability decides the report, null when sanctioned
    function erasedOperand(source: TSESTree.Expression): TSESTree.Node | null {
      const form = getAdoptionForm(source, context);
      if (form) {
        return isAllowedForm(form) ? null : getAdoptedOperand(source, context);
      }
      if (source.type === AST_NODE_TYPES.Identifier) {
        if (options.retainedHandle !== false && hasRetainedHandle(source, context.sourceCode.getScope(source))) {
          return null;
        }
        if (initializerIsAllowedAdoption(source)) {
          return null;
        }
      }
      return source;
    }

    function isCancelableOperand(operand: TSESTree.Node): boolean {
      return (
        isCancelableExpression(operand as TSESTree.Expression, context, settings) &&
        !isLazyExpression(operand, context, settings)
      );
    }

    function check(source: TSESTree.Expression, messageId: MessageIds): void {
      const operand = erasedOperand(source);
      if (!operand) {
        return;
      }
      if (sinkMatchesSomeSpecifier(source, safeSinks, context)) {
        return;
      }
      if (isCancelableOperand(operand) && isPlainPromiseContextualSink(source, context)) {
        context.report({ node: source, messageId });
      }
    }

    function checkReturn(fn: TSESTree.FunctionLike, source: TSESTree.Expression): void {
      // callbacks get their return type from the callee, which already adopts what they return
      if (!fn.returnType && isCallLike(fn.parent) && fn.parent.arguments.includes(fn as TSESTree.Expression)) {
        return;
      }
      const operand = erasedOperand(source);
      if (!operand || sinkMatchesSomeSpecifier(source, safeSinks, context)) {
        return;
      }
      if (isCancelableOperand(operand) && isPlainPromiseReturnSink(fn, context)) {
        context.report({ node: source, messageId: fn.async ? 'erasedReturnAsync' : 'erasedReturn' });
      }
    }

    function enclosingFunction(node: TSESTree.Node): TSESTree.FunctionLike | null {
      let current = node.parent;
      while (current) {
        if (isFunctionLike(current)) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function checkArguments(node: TSESTree.CallExpression | TSESTree.NewExpression): void {
      if (options.checkArguments === false) {
        return;
      }
      if (
        getAdoptionForm(node, context) ||
        isPromiseCombinatorCall(node, context) ||
        isCancDeclaredCallee(node, context)
      ) {
        return;
      }
      for (const arg of node.arguments) {
        if (arg.type !== AST_NODE_TYPES.SpreadElement) {
          check(arg, 'erasedArgument');
        }
      }
    }

    const checkWidening = options.checkAssignments !== false && options.allowAnnotationWidening !== true;

    return {
      CallExpression: checkArguments,
      NewExpression: checkArguments,

      ReturnStatement(node) {
        if (options.checkReturns === false || !node.argument) {
          return;
        }
        const fn = enclosingFunction(node);
        if (fn) {
          checkReturn(fn, node.argument);
        }
      },

      ArrowFunctionExpression(node) {
        if (options.checkReturns !== false && node.body.type !== AST_NODE_TYPES.BlockStatement) {
          checkReturn(node, node.body);
        }
      },

      VariableDeclarator(node) {
        if (!checkWidening || !node.init || !node.id.typeAnnotation) {
          return;
        }
        if (node.init.type === AST_NODE_TYPES.ArrayExpression) {
          for (const element of node.init.elements) {
            if (element && element.type !== AST_NODE_TYPES.SpreadElement) {
              check(element, 'erasedAssignment');
            }
          }
          return;
        }
        check(node.init, 'erasedAssignment');
      },

      AssignmentExpression(node) {
        if (node.operator !== '=') {
          return;
        }
        if (node.left.type === AST_NODE_TYPES.MemberExpression) {
          if (options.checkProperties !== false) {
            check(node.right, 'erasedProperty');
          }
          return;
        }
        if (checkWidening && node.left.type === AST_NODE_TYPES.Identifier) {
          check(node.right, 'erasedAssignment');
        }
      },

      PropertyDefinition(node) {
        if (options.checkProperties === false || !node.value) {
          return;
        }
        if (node.typeAnnotation && options.allowAnnotationWidening === true) {
          return;
        }
        check(node.value, 'erasedProperty');
      },

      Property(node) {
        if (options.checkProperties === false || node.parent.type !== AST_NODE_TYPES.ObjectExpression) {
          return;
        }
        if (node.value.type === AST_NODE_TYPES.AssignmentPattern || node.kind !== 'init') {
          return;
        }
        const owner = node.parent.parent;
        if (isCallLike(owner) && owner.arguments.includes(node.parent) && isCancDeclaredCallee(owner, context)) {
          return;
        }
        check(node.value as TSESTree.Expression, 'erasedProperty');
      },
    };
  },
});
