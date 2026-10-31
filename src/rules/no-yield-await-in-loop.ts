import type { Scope } from '@typescript-eslint/scope-manager';
import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCoroutineContext, refersTo } from '../util/canc-imports.js';
import {
  type FactoryOptions,
  factoryOptionsConstraints,
  factoryOptionsSchema,
  resolveFactories,
} from '../util/coroutine-factories.js';
import createRule from '../util/create-rule.js';
import { unwrapTypeOnly } from '../util/executor.js';

export type MessageIds = 'serializedSteps';
export type RuleOptions = [FactoryOptions?];

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

const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
]);

function collectInnerLabels(body: TSESTree.Node): Set<string> {
  const labels = new Set<string>();
  function walk(node: TSESTree.Node) {
    if (node.type === AST_NODE_TYPES.LabeledStatement) {
      labels.add(node.label.name);
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
  walk(body);
  return labels;
}

function loopHasBreakOrReturn(loopNode: TSESTree.Node): boolean {
  let hasExit = false;
  const innerLabels = collectInnerLabels((loopNode as TSESTree.ForOfStatement).body);

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
        if (nested.type === AST_NODE_TYPES.BreakStatement && nested.label && !innerLabels.has(nested.label.name)) {
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
    if (node.type === AST_NODE_TYPES.BreakStatement && (!node.label || !innerLabels.has(node.label.name))) {
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
    if (loopNode.test && loopNode.body) {
      const indexVars = getPureIndexVariables(loopNode.body);
      function extractTestVars(node: TSESTree.Node) {
        if (node.type === AST_NODE_TYPES.Identifier) {
          const parent = node.parent;
          if (
            parent &&
            ((parent.type === AST_NODE_TYPES.MemberExpression && !parent.computed && parent.property === node) ||
              (parent.type === AST_NODE_TYPES.Property && !parent.computed && parent.key === node))
          ) {
            return;
          }
          if (indexVars.has(node.name)) {
            vars.add(node.name);
          }
          return;
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
      extractTestVars(loopNode.test);
    }
  }

  return vars;
}

function getPureIndexVariables(body: TSESTree.Node): Set<string> {
  const indexVars = new Set<string>();
  const nonIndexVars = new Set<string>();

  function extractPattern(pattern: TSESTree.Node, targetSet: Set<string>) {
    if (pattern.type === AST_NODE_TYPES.Identifier) {
      targetSet.add(pattern.name);
    } else if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
      for (const prop of pattern.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          extractPattern(prop.value, targetSet);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          extractPattern(prop.argument, targetSet);
        }
      }
    } else if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
      for (const elem of pattern.elements) {
        if (elem) {
          extractPattern(elem, targetSet);
        }
      }
    } else if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
      extractPattern(pattern.left, targetSet);
    } else if (pattern.type === AST_NODE_TYPES.RestElement) {
      extractPattern(pattern.argument, targetSet);
    }
  }

  function walk(node: TSESTree.Node) {
    if (
      node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return;
    }

    if (node.type === AST_NODE_TYPES.UpdateExpression && node.argument.type === AST_NODE_TYPES.Identifier) {
      if (!nonIndexVars.has(node.argument.name)) {
        indexVars.add(node.argument.name);
      }
    } else if (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.Identifier &&
      (node.operator === '+=' || node.operator === '-=') &&
      node.right.type === AST_NODE_TYPES.Literal &&
      typeof node.right.value === 'number'
    ) {
      if (!nonIndexVars.has(node.left.name)) {
        indexVars.add(node.left.name);
      }
    } else if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      const assigned = new Set<string>();
      extractPattern(node.left, assigned);
      for (const name of assigned) {
        nonIndexVars.add(name);
        indexVars.delete(name);
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

  walk(body);
  return indexVars;
}

type StatePaths = Map<string, string[][]>;

function memberPath(node: TSESTree.Node): { root: TSESTree.Identifier; path: string[] } | null {
  const path: string[] = [];
  let curr = unwrapTypeOnly(node);
  let complete = true;
  while (curr.type === AST_NODE_TYPES.MemberExpression) {
    if (!curr.computed && curr.property.type === AST_NODE_TYPES.Identifier) {
      path.unshift(curr.property.name);
    } else {
      path.length = 0;
      complete = false;
    }
    curr = unwrapTypeOnly(curr.object);
  }
  if (curr.type !== AST_NODE_TYPES.Identifier) return null;
  return { root: curr, path: complete ? path : [] };
}

function getMutatedPaths(body: TSESTree.Node, skip: ReadonlySet<TSESTree.Node>): StatePaths {
  const mutated: StatePaths = new Map();

  function add(name: string, path: string[]) {
    const list = mutated.get(name);
    if (list) list.push(path);
    else mutated.set(name, [path]);
  }

  function extractPattern(pattern: TSESTree.Node) {
    if (pattern.type === AST_NODE_TYPES.Identifier) {
      add(pattern.name, []);
    } else if (pattern.type === AST_NODE_TYPES.MemberExpression) {
      const target = memberPath(pattern);
      if (target) add(target.root.name, target.path);
    } else if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
      for (const prop of pattern.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          extractPattern(prop.value);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          extractPattern(prop.argument);
        }
      }
    } else if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
      for (const elem of pattern.elements) {
        if (elem) {
          extractPattern(elem);
        }
      }
    } else if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
      extractPattern(pattern.left);
    } else if (pattern.type === AST_NODE_TYPES.RestElement) {
      extractPattern(pattern.argument);
    }
  }

  function walk(node: TSESTree.Node) {
    if (
      skip.has(node) ||
      node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return;
    }

    if (node.type === AST_NODE_TYPES.UpdateExpression) {
      extractPattern(node.argument);
    } else if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      extractPattern(node.left);
    } else if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      !node.callee.computed &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      MUTATING_METHODS.has(node.callee.property.name)
    ) {
      // collection mutated in the body carries state between iterations
      const receiver = memberPath(node.callee.object);
      if (receiver) add(receiver.root.name, receiver.path);
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

  walk(body);
  return mutated;
}

function pathsOverlap(a: string[], b: string[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function operandReadsMutatedState(operand: TSESTree.Node, mutated: StatePaths, loopVars: Set<string>): boolean {
  let reads = false;

  function walk(node: TSESTree.Node) {
    if (reads) return;
    if (node.type === AST_NODE_TYPES.Identifier) {
      const parent = node.parent;
      if (
        parent &&
        ((parent.type === AST_NODE_TYPES.MemberExpression && !parent.computed && parent.property === node) ||
          (parent.type === AST_NODE_TYPES.Property && !parent.computed && parent.key === node) ||
          (parent.type === AST_NODE_TYPES.MethodDefinition && !parent.computed && parent.key === node))
      ) {
        return;
      }
      const writes = mutated.get(node.name);
      if (!writes || loopVars.has(node.name)) return;
      const path: string[] = [];
      let curr: TSESTree.Node = node;
      while (curr.parent?.type === AST_NODE_TYPES.MemberExpression && curr.parent.object === curr) {
        const member: TSESTree.MemberExpression = curr.parent;
        if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) break;
        path.push(member.property.name);
        curr = member;
      }
      if (writes.some((w) => pathsOverlap(w, path))) {
        reads = true;
      }
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

  walk(operand);
  return reads;
}

function operandReferencesAny(operand: TSESTree.Node, targetVars: Set<string>, scope: Scope): boolean {
  let references = false;

  function walk(node: TSESTree.Node) {
    if (references) return;
    if (node.type === AST_NODE_TYPES.Identifier) {
      const parent = node.parent;
      if (
        parent &&
        ((parent.type === AST_NODE_TYPES.MemberExpression && !parent.computed && parent.property === node) ||
          (parent.type === AST_NODE_TYPES.Property && !parent.computed && parent.key === node) ||
          (parent.type === AST_NODE_TYPES.MethodDefinition && !parent.computed && parent.key === node))
      ) {
        return;
      }
      if (targetVars.has(node.name)) {
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

function collectAwaitedCalls(body: TSESTree.Node): Set<TSESTree.Node> {
  const calls = new Set<TSESTree.Node>();
  function walk(node: TSESTree.Node) {
    if (
      node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return;
    }
    if (node.type === AST_NODE_TYPES.YieldExpression && node.delegate && node.argument) {
      const call = unwrapTypeOnly(node.argument);
      if (call.type === AST_NODE_TYPES.CallExpression) {
        calls.add(call);
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
  walk(body);
  return calls;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-yield-await-in-loop',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow serialized yield* cancAwait in loops where steps appear independent.',
    },
    schema: [
      {
        type: 'object',
        properties: factoryOptionsSchema,
        allOf: factoryOptionsConstraints,
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      serializedSteps:
        "Each iteration waits for the previous one although the steps look independent. Run them together with 'yield* cancAwait.all(...)', or disable this rule if the order matters.",
    },
  },
  defaultOptions: [{}],
  create(context) {
    const factories = resolveFactories(context.options[0]);
    const mutatedPathsCache = new WeakMap<TSESTree.Node, StatePaths>();

    return {
      YieldExpression(node) {
        if (!node.delegate || !node.argument) {
          return;
        }

        let arg: TSESTree.Node = node.argument;
        while (
          arg.type === AST_NODE_TYPES.TSAsExpression ||
          arg.type === AST_NODE_TYPES.TSTypeAssertion ||
          arg.type === AST_NODE_TYPES.TSNonNullExpression
        ) {
          arg = arg.expression;
        }

        if (arg.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }

        const coroutineCtx = getCoroutineContext(node, context, factories);
        if (!coroutineCtx) {
          return;
        }

        const call = arg;
        const callee = call.callee;
        const targetAwait = coroutineCtx.kind === 'cancGenAsync' ? 'cancGenAwait' : 'cancAwait';

        // Check for concurrent combinators: cancAwait.all / canc.await.all etc.
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          ['all', 'allSettled', 'race'].includes(callee.property.name) &&
          refersTo(callee.object, context, targetAwait)
        ) {
          return;
        }

        if (!refersTo(callee, context, targetAwait)) {
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
        if (!firstArg || !operandReferencesAny(firstArg, loopVars, scope)) {
          // Independent of loop variable -> silent
          return;
        }

        // Silence if operand reads state written elsewhere in the loop body (accumulator)
        const loopBody = (loopNode as TSESTree.ForOfStatement).body;
        if (loopBody) {
          let mutated = mutatedPathsCache.get(loopBody);
          if (!mutated) {
            const skipped = collectAwaitedCalls(loopBody);
            mutated = getMutatedPaths(loopBody, skipped);
            mutatedPathsCache.set(loopBody, mutated);
          }
          if (operandReadsMutatedState(firstArg, mutated, loopVars)) {
            return;
          }
        }

        context.report({
          node,
          messageId: 'serializedSteps',
        });
      },
    };
  },
});
