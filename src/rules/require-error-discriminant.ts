import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

import { type ClassMatcherOptions, classMatcherSchema, compileOptions, isIncluded } from '../util/class-matcher.js';
import createRule from '../util/create-rule.js';
import { getFailureMembers, isCancelErrorType } from '../util/failure-types.js';

export type MessageIds = 'missingDiscriminant';
export type RuleOptions = [ClassMatcherOptions?];

const MATCHER_NAMES = new Set(['isErrorOf', 'createIsError', 'withFailure', 'suppressErrors', 'catchErrors']);
const THROW_NAMES = new Set(['cancThrow', 'cancGenThrow']);

function isCancThrowCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return THROW_NAMES.has(expr.text);
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const objText = expr.expression.getText();
    const propText = expr.name.text;
    return (
      ((objText === 'canc' || objText === 'cancGen') && propText === 'throw') ||
      (objText === 'CancelablePromise' && propText === 'fail')
    );
  }
  return false;
}

function isMatcherCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return MATCHER_NAMES.has(expr.text);
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return MATCHER_NAMES.has(expr.name.text);
  }
  return false;
}

function isInsideCatch(node: ts.Node): boolean {
  let curr: ts.Node = node;
  while (!ts.isSourceFile(curr)) {
    if (ts.isCatchClause(curr)) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function extendsErrorTransitively(type: ts.Type, checker: ts.TypeChecker, visited = new Set<ts.Type>()): boolean {
  if (visited.has(type)) return false;
  visited.add(type);

  if (type.isClassOrInterface() || type.flags & ts.TypeFlags.Object) {
    const baseTypes = checker.getBaseTypes(type as ts.InterfaceType);
    for (const base of baseTypes) {
      const sym = base.aliasSymbol ?? base.getSymbol() ?? base.symbol;
      if (sym.name === 'Error') {
        return true;
      }
      if (extendsErrorTransitively(base, checker, visited)) {
        return true;
      }
    }
  }
  return false;
}

function declaresOwnMember(node: TSESTree.ClassDeclaration): boolean {
  for (const member of node.body.body) {
    if (member.type === AST_NODE_TYPES.PropertyDefinition) {
      if (!member.static) {
        return true;
      }
    } else if (member.type === AST_NODE_TYPES.AccessorProperty) {
      if (!member.static) {
        return true;
      }
    } else if (member.type === AST_NODE_TYPES.MethodDefinition) {
      if (!member.static) {
        if (member.kind !== 'constructor') {
          return true;
        }
        if (member.value.params.some((p) => p.type === AST_NODE_TYPES.TSParameterProperty)) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasInheritedDiscriminant(instanceType: ts.Type, checker: ts.TypeChecker, node: ts.Node): boolean {
  const props = checker.getPropertiesOfType(instanceType);
  for (const prop of props) {
    const propName = prop.name;
    if (propName !== 'name' && propName !== 'message' && propName !== 'stack' && propName !== 'cause') {
      return true;
    }
    if (propName === 'name') {
      const propType = checker.getTypeOfSymbolAtLocation(prop, node);
      if (propType.isStringLiteral() || propType.flags & ts.TypeFlags.StringLiteral) {
        return true;
      }
    }
  }
  return false;
}

function resolvesToSymbol(sym: ts.Symbol | undefined, target: ts.Symbol, checker: ts.TypeChecker): boolean {
  if (!sym) return false;
  if (sym === target) return true;
  if (sym.flags & ts.SymbolFlags.Alias) {
    const aliased = checker.getAliasedSymbol(sym);
    if (aliased === target) return true;
  }
  return false;
}

function nodeUsesFailure(node: ts.Node, classSym: ts.Symbol, instanceType: ts.Type, checker: ts.TypeChecker): boolean {
  if (ts.isTypeReferenceNode(node)) {
    const sym = checker.getSymbolAtLocation(node.typeName);
    if (resolvesToSymbol(sym, classSym, checker)) {
      let curr: ts.Node = node;
      while (!ts.isSourceFile(curr)) {
        const parent = curr.parent;

        if (ts.isUnionTypeNode(parent) || ts.isParenthesizedTypeNode(parent)) {
          curr = parent;
          continue;
        }
        if (ts.isTypeReferenceNode(parent)) {
          const parentSym = checker.getSymbolAtLocation(parent.typeName);
          const parentName = parentSym?.name ?? parent.typeName.getText();
          if (parentName === 'CancelablePromise' || parentName === 'LazyPromise' || parentName === 'AsyncResult') {
            if (parent.typeArguments && parent.typeArguments.length >= 2 && parent.typeArguments[1] === curr) {
              return true;
            }
          } else if (parentName === 'withFailure') {
            return true;
          }
        }
        break;
      }
    }
  } else if (ts.isCallExpression(node)) {
    if (isCancThrowCallee(node.expression)) {
      if (node.arguments.length > 0) {
        const argType = checker.getTypeAtLocation(node.arguments[0]);
        const types = argType.isUnion() ? argType.types : [argType];
        if (types.some((t) => t.symbol === classSym || t.aliasSymbol === classSym || t === instanceType)) {
          return true;
        }
      }
    } else if (isMatcherCallee(node.expression)) {
      if (!isInsideCatch(node)) {
        for (const arg of node.arguments) {
          const argSym = checker.getSymbolAtLocation(arg);
          if (resolvesToSymbol(argSym, classSym, checker)) {
            return true;
          }
        }
      }
    }
  } else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
    const type = checker.getTypeAtLocation(node);
    const failureMembers = getFailureMembers(type, checker);
    if (failureMembers.listed.some((t) => t.symbol === classSym || t.aliasSymbol === classSym || t === instanceType)) {
      return true;
    }
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && nodeUsesFailure(child, classSym, instanceType, checker)) {
      found = true;
    }
  });
  return found;
}

function isUsedAsFailureInProgram(
  classSym: ts.Symbol,
  instanceType: ts.Type,
  program: ts.Program,
  checker: ts.TypeChecker,
): boolean {
  const sourceFiles = program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'));

  for (const sf of sourceFiles) {
    if (nodeUsesFailure(sf, classSym, instanceType, checker)) {
      return true;
    }
  }

  return false;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'require-error-discriminant',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require declared error classes in failure sets to have a discriminant property.',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          include: classMatcherSchema,
          exclude: classMatcherSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ include: [], exclude: [] }],
    messages: {
      missingDiscriminant:
        "Error class '{{className}}' declared or used as a failure has no discriminant. Add a readonly discriminant field, a literal 'name' property, or a Symbol.for brand.",
    },
  },
  defaultOptions: [{ include: [], exclude: [] }],

  create(context) {
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
      return {};
    }

    const program = parserServices.program;
    const esTreeNodeToTSNodeMap = parserServices.esTreeNodeToTSNodeMap;
    const checker = program.getTypeChecker();
    const options = compileOptions(context.options[0]);

    return {
      ClassDeclaration(node) {
        if (!node.id) {
          return;
        }

        const className = node.id.name;
        const tsNode = esTreeNodeToTSNodeMap.get(node.id);
        const classSym = checker.getSymbolAtLocation(tsNode);
        if (!classSym) {
          return;
        }

        const instanceType = checker.getDeclaredTypeOfSymbol(classSym);
        if (!extendsErrorTransitively(instanceType, checker)) {
          return;
        }

        if (isCancelErrorType(instanceType, checker)) {
          return;
        }

        if (declaresOwnMember(node)) {
          return;
        }

        if (hasInheritedDiscriminant(instanceType, checker, tsNode)) {
          return;
        }

        if (!isIncluded(options, { name: className, type: instanceType, checker, program }, checker, program)) {
          return;
        }

        if (!isUsedAsFailureInProgram(classSym, instanceType, program, checker)) {
          return;
        }

        context.report({
          node: node.id,
          messageId: 'missingDiscriminant',
          data: { className },
          suggest: [
            {
              messageId: 'missingDiscriminant',
              data: { className },
              fix(fixer) {
                if (node.body.body.length > 0) {
                  return fixer.insertTextBefore(node.body.body[0], `readonly kind = '${className}';\n  `);
                }
                const openBrace = context.sourceCode.getFirstToken(node.body);
                if (openBrace) {
                  return fixer.insertTextAfter(openBrace, `\n  readonly kind = '${className}';\n`);
                }
                return null;
              },
            },
          ],
        });
      },
    };
  },
});
