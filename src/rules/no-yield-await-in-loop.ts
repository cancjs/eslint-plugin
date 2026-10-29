import type { Scope } from '@typescript-eslint/scope-manager';
import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';

export type MessageIds = 'serializedSteps';
export type RuleOptions = [];

function isLoopNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement
  );
}

function getEnclosingLoop(node: TSESTree.Node, boundaryFn: TSESTree.Node): TSESTree.Node | null {
  let curr = node.parent;
  while (curr && curr !== boundaryFn) {
    if (
      curr.type === AST_NODE_TYPES.FunctionDeclaration ||
      curr.type === AST_NODE_TYPES.FunctionExpression ||
      curr.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return null;
    }
    if (isLoopNode(curr)) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

function loopHasBreakOrReturn(loopNode: TSESTree.Node): boolean {
  let hasExit = false;

  function walk(node: TSESTree.Node) {
    if (hasExit) return;
    if (
      node !== loopNode &&
      (node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      return;
    }
    if (node !== loopNode && isLoopNode(node)) {
      // Check for return inside nested loop
      function walkNested(nested: TSESTree.Node) {
        if (hasExit) return;
        if (nested.type === AST_NODE_TYPES.ReturnStatement) {
          hasExit = true;
          return;
        }
        for (const key of Object.keys(nested)) {
          if (key === 'parent') continue;
          const child = (nested as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) walkNested(item as TSESTree.Node);
              }
            } else if ('type' in child) {
              walkNested(child as TSESTree.Node);
            }
          }
        }
      }
      walkNested(node);
      return;
    }

    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      hasExit = true;
      return;
    }
    if (node.type === AST_NODE_TYPES.BreakStatement && !node.label) {
      hasExit = true;
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) walk(item as TSESTree.Node);
          }
        } else if ('type' in child) {
          walk(child as TSESTree.Node);
        }
      }
    }
  }

  const body = (loopNode as TSESTree.ForOfStatement).body;
  if (body) {
    walk(body);
  }
  return hasExit;
}

function getLoopVariables(loopNode: TSESTree.Node): Set<string> {
  const vars = new Set<string>();

  function extractNames(pattern: TSESTree.Node) {
    if (pattern.type === AST_NODE_TYPES.Identifier) {
      vars.add(pattern.name);
    } else if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
      for (const prop of pattern.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          extractNames(prop.value);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          extractNames(prop.argument);
        }
      }
    } else if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
      for (const elem of pattern.elements) {
        if (elem) {
          extractNames(elem);
        }
      }
    } else if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
      extractNames(pattern.left);
    } else if (pattern.type === AST_NODE_TYPES.RestElement) {
      extractNames(pattern.argument);
    }
  }

  if (loopNode.type === AST_NODE_TYPES.ForOfStatement || loopNode.type === AST_NODE_TYPES.ForInStatement) {
    if (loopNode.left.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const decl of loopNode.left.declarations) {
        extractNames(decl.id);
      }
    } else {
      extractNames(loopNode.left);
    }
  } else if (loopNode.type === AST_NODE_TYPES.ForStatement) {
    if (loopNode.init && loopNode.init.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const decl of loopNode.init.declarations) {
        extractNames(decl.id);
      }
    }
  } else if (loopNode.type === AST_NODE_TYPES.WhileStatement || loopNode.type === AST_NODE_TYPES.DoWhileStatement) {
    function extractTestVars(node: TSESTree.Node) {
      if (node.type === AST_NODE_TYPES.Identifier) {
        vars.add(node.name);
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) extractTestVars(item as TSESTree.Node);
            }
          } else if ('type' in child) {
            extractTestVars(child as TSESTree.Node);
          }
        }
      }
    }
    if (loopNode.test) {
      extractTestVars(loopNode.test);
    }
  }

  return vars;
}

function operandReferencesLoopVar(operand: TSESTree.Node, loopVars: Set<string>, scope: Scope): boolean {
  let references = false;

  function walk(node: TSESTree.Node) {
    if (references) return;
    if (node.type === AST_NODE_TYPES.Identifier) {
      if (loopVars.has(node.name)) {
        // Confirm resolution via scope
        let curr: Scope | null = scope;
        while (curr) {
          const v = curr.set.get(node.name);
          if (v) {
            references = true;
            return;
          }
          curr = curr.upper;
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) walk(item as TSESTree.Node);
          }
        } else if ('type' in child) {
          walk(child as TSESTree.Node);
        }
      }
    }
  }

  walk(operand);
  return references;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-yield-await-in-loop',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow serialized yield* cancAwait in loops where steps appear independent.',
    },
    schema: [],
    messages: {
      serializedSteps:
        "Each iteration waits for the previous one although the steps look independent. Run them together with 'yield* cancAwait.all(...)', or disable this rule if the order matters.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      YieldExpression(node) {
        if (!node.delegate || !node.argument) {
          return;
        }

        if (node.argument.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }

        const coroutineCtx = getCoroutineContext(node, context);
        if (!coroutineCtx) {
          return;
        }

        const call = node.argument;
        const callee = call.callee;
        const targetAwait = coroutineCtx.kind === 'cancGenAsync' ? 'cancGenAwait' : 'cancAwait';

        let isTargetAwait = false;
        if (callee.type === AST_NODE_TYPES.Identifier && refersTo(callee, context, targetAwait)) {
          isTargetAwait = true;
        } else if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          refersTo(callee.object, context, targetAwait)
        ) {
          // e.g. cancAwait.all(...) - already concurrent, do not report!
          return;
        }

        if (!isTargetAwait) {
          return;
        }

        // Must be inside a loop
        const loopNode = getEnclosingLoop(node, coroutineCtx.genFn);
        if (!loopNode) {
          return;
        }

        // If loop has break or return, sequential intent -> silent
        if (loopHasBreakOrReturn(loopNode)) {
          return;
        }

        // Get loop variables
        const loopVars = getLoopVariables(loopNode);
        if (loopVars.size === 0) {
          return;
        }

        // Check if the argument to cancAwait references any loop variable
        const scope = context.sourceCode.getScope(node);
        const firstArg = call.arguments[0];
        if (!firstArg || !operandReferencesLoopVar(firstArg, loopVars, scope)) {
          // Accumulator-dependent or independent of loop variable -> silent
          return;
        }

        context.report({
          node,
          messageId: 'serializedSteps',
        });
      },
    };
  },
});
