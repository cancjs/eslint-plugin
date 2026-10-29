import { DefinitionType } from '@typescript-eslint/scope-manager';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

export type MessageIds = 'leakedAbortListener' | 'inlineListenerNoOnce';
export type RuleOptions = [];

interface CodePathSegment {
  id: string;
  reachable: boolean;
  prevSegments: CodePathSegment[];
  nextSegments: CodePathSegment[];
  allPrevSegments: CodePathSegment[];
  allNextSegments: CodePathSegment[];
}

interface CodePath {
  id: string;
  initialSegment: CodePathSegment;
  finalSegments: CodePathSegment[];
  returnedSegments: CodePathSegment[];
  thrownSegments: CodePathSegment[];
  currentSegments: CodePathSegment[];
}

interface Registration {
  id: string;
  signalKey: string;
  fnName: string;
  node: TSESTree.CallExpression;
}

interface SegmentOp {
  type: 'add' | 'remove';
  id: string;
  reg?: Registration;
}

interface FunctionContext {
  codePath: CodePath;
  fnNode: TSESTree.Node;
  segmentOps: Map<string, SegmentOp[]>;
  registrations: Map<string, Registration>;
  currentSegment: CodePathSegment | null;
  reassignedListeners: Set<string>;
  loopBackEdges: Array<{ from: string; to: string }>;
}

function isDescendant(child: TSESTree.Node, parent: TSESTree.Node): boolean {
  let curr: TSESTree.Node | undefined = child;
  while (curr) {
    if (curr === parent) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function findVariable(name: string, scope: TSESLint.Scope.Scope | null): TSESLint.Scope.Variable | undefined {
  let curr = scope;
  while (curr) {
    const v = curr.variables.find((item) => item.name === name);
    if (v) return v;
    curr = curr.upper;
  }
  return undefined;
}

function isInsideTrackedExecutor(node: TSESTree.Node, context: TSESLint.RuleContext<MessageIds, RuleOptions>): boolean {
  let curr: TSESTree.Node | undefined = node;
  while (curr) {
    if (curr.type === AST_NODE_TYPES.FunctionExpression || curr.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      if (curr.parent?.type === AST_NODE_TYPES.NewExpression) {
        if (analyzeExecutor(curr.parent, context)) {
          return true;
        }
      }
    }
    curr = curr.parent;
  }
  return false;
}

function isLocallyCreatedSignal(
  node: TSESTree.Node,
  fnNode: TSESTree.Node,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  let targetIdent: TSESTree.Identifier | null = null;
  if (node.type === AST_NODE_TYPES.Identifier) {
    targetIdent = node;
  } else if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'signal' &&
    node.object.type === AST_NODE_TYPES.Identifier
  ) {
    targetIdent = node.object;
  }

  if (!targetIdent) {
    return false;
  }

  const scope = context.sourceCode.getScope(targetIdent);
  const variable = findVariable(targetIdent.name, scope);
  if (!variable) {
    return false;
  }

  for (const def of variable.defs) {
    if (def.type === DefinitionType.Parameter) {
      return false;
    }
    if (!isDescendant(def.node, fnNode)) {
      return false;
    }
    if (def.node.type === AST_NODE_TYPES.VariableDeclarator) {
      if (def.node.id.type === AST_NODE_TYPES.ObjectPattern && def.node.init) {
        let init = def.node.init;
        while (
          init.type === AST_NODE_TYPES.TSAsExpression ||
          init.type === AST_NODE_TYPES.TSTypeAssertion ||
          init.type === AST_NODE_TYPES.TSNonNullExpression
        ) {
          init = init.expression;
        }
        if (
          init.type === AST_NODE_TYPES.NewExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'AbortController'
        ) {
          return true;
        }
        if (init.type === AST_NODE_TYPES.Identifier) {
          const cVar = findVariable(init.name, scope);
          if (cVar) {
            for (const cDef of cVar.defs) {
              if (
                cDef.node.type === AST_NODE_TYPES.VariableDeclarator &&
                cDef.node.init?.type === AST_NODE_TYPES.NewExpression &&
                cDef.node.init.callee.type === AST_NODE_TYPES.Identifier &&
                cDef.node.init.callee.name === 'AbortController'
              ) {
                return true;
              }
            }
          }
        }
      }

      if (def.node.init) {
        let init = def.node.init;
        while (
          init.type === AST_NODE_TYPES.TSAsExpression ||
          init.type === AST_NODE_TYPES.TSTypeAssertion ||
          init.type === AST_NODE_TYPES.TSNonNullExpression
        ) {
          init = init.expression;
        }
        if (
          init.type === AST_NODE_TYPES.NewExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'AbortController'
        ) {
          return true;
        }
        if (
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'createAbortSignal'
        ) {
          return true;
        }
        if (
          init.type === AST_NODE_TYPES.MemberExpression &&
          init.property.type === AST_NODE_TYPES.Identifier &&
          init.property.name === 'signal' &&
          init.object.type === AST_NODE_TYPES.Identifier
        ) {
          const cVar = findVariable(init.object.name, scope);
          if (cVar) {
            for (const cDef of cVar.defs) {
              if (
                cDef.node.type === AST_NODE_TYPES.VariableDeclarator &&
                cDef.node.init?.type === AST_NODE_TYPES.NewExpression &&
                cDef.node.init.callee.type === AST_NODE_TYPES.Identifier &&
                cDef.node.init.callee.name === 'AbortController'
              ) {
                return true;
              }
            }
          }
        }
      }
    }
  }

  return false;
}

function hasOnceOption(optionsNode: TSESTree.Node | undefined): boolean {
  if (!optionsNode) return false;
  if (optionsNode.type === AST_NODE_TYPES.ObjectExpression) {
    for (const prop of optionsNode.properties) {
      if (
        prop.type === AST_NODE_TYPES.Property &&
        ((prop.key.type === AST_NODE_TYPES.Identifier && prop.key.name === 'once') ||
          (prop.key.type === AST_NODE_TYPES.Literal && prop.key.value === 'once'))
      ) {
        if (prop.value.type === AST_NODE_TYPES.Literal && prop.value.value === true) {
          return true;
        }
        if (prop.value.type === AST_NODE_TYPES.Identifier && prop.value.name === 'true') {
          return true;
        }
      }
    }
  }
  return false;
}

function isProtectedByFinally(
  regNode: TSESTree.Node,
  fnName: string,
  signalKey: string,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  let curr: TSESTree.Node | undefined = regNode.parent;
  while (curr) {
    if (curr.type === AST_NODE_TYPES.TryStatement && curr.finalizer) {
      if (isDescendant(regNode, curr.block)) {
        let hasRemove = false;
        const scan = (node: TSESTree.Node): void => {
          if (hasRemove) return;
          if (
            node.type === AST_NODE_TYPES.CallExpression &&
            node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'removeEventListener' &&
            node.arguments.length >= 2
          ) {
            const arg0 = node.arguments[0];
            const isAbort =
              (arg0.type === AST_NODE_TYPES.Literal && arg0.value === 'abort') ||
              (arg0.type === AST_NODE_TYPES.TemplateLiteral &&
                arg0.quasis.length === 1 &&
                arg0.quasis[0].value.raw === 'abort');
            if (isAbort) {
              const sig = context.sourceCode.getText(node.callee.object);
              const fnArg = node.arguments[1];
              if (sig === signalKey && fnArg.type === AST_NODE_TYPES.Identifier && fnArg.name === fnName) {
                hasRemove = true;
                return;
              }
            }
          }
          for (const key of Object.keys(node)) {
            if (key === 'parent') continue;
            const child = (node as unknown as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
              if (Array.isArray(child)) {
                for (const item of child) {
                  if (item && typeof item === 'object' && 'type' in item) {
                    scan(item as TSESTree.Node);
                  }
                }
              } else if ('type' in child) {
                scan(child as TSESTree.Node);
              }
            }
          }
        };
        scan(curr.finalizer);
        if (hasRemove) {
          return true;
        }
      }
    }
    curr = curr.parent;
  }
  return false;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-abort-listener-leak',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require removing abort listeners on all code paths or using { once: true } to prevent leaks.',
    },
    schema: [],
    messages: {
      leakedAbortListener: "Abort listener '{{name}}' is registered on '{{signal}}' but not removed on all code paths.",
      inlineListenerNoOnce:
        "Inline listener function cannot be removed later; pass a named function reference or use '{ once: true }'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const fnStack: FunctionContext[] = [];

    function currentFn(): FunctionContext | undefined {
      return fnStack[fnStack.length - 1];
    }

    return {
      onCodePathStart(codePath: CodePath, node: TSESTree.Node) {
        if (node.type === AST_NODE_TYPES.Program) {
          return;
        }
        fnStack.push({
          codePath,
          fnNode: node,
          segmentOps: new Map(),
          registrations: new Map(),
          currentSegment: null,
          reassignedListeners: new Set(),
          loopBackEdges: [],
        });
      },

      onCodePathSegmentStart(segment: CodePathSegment) {
        const fn = currentFn();
        if (fn) {
          fn.currentSegment = segment;
        }
      },

      onCodePathSegmentEnd() {
        const fn = currentFn();
        if (fn) {
          fn.currentSegment = null;
        }
      },

      onCodePathSegmentLoop(fromSegment: CodePathSegment, toSegment: CodePathSegment) {
        const fn = currentFn();
        if (fn) {
          fn.loopBackEdges.push({ from: fromSegment.id, to: toSegment.id });
        }
      },

      onCodePathEnd(codePath: CodePath, node: TSESTree.Node) {
        if (node.type === AST_NODE_TYPES.Program) {
          return;
        }
        const fn = fnStack.pop();
        if (!fn || fn.registrations.size === 0) {
          return;
        }

        // Fixed-point forward dataflow analysis
        const inMap = new Map<string, Set<string>>();
        const outMap = new Map<string, Set<string>>();

        const worklist: CodePathSegment[] = [codePath.initialSegment];
        const inWorklist = new Set<string>([codePath.initialSegment.id]);

        while (worklist.length > 0) {
          const seg = worklist.shift()!;
          inWorklist.delete(seg.id);

          const inSet = new Set<string>();
          for (const prev of seg.prevSegments) {
            if (prev.reachable) {
              const pOut = outMap.get(prev.id);
              if (pOut) {
                for (const item of pOut) {
                  inSet.add(item);
                }
              }
            }
          }
          inMap.set(seg.id, inSet);

          const outSet = new Set<string>(inSet);
          const ops = fn.segmentOps.get(seg.id) ?? [];
          for (const op of ops) {
            if (op.type === 'add') {
              outSet.add(op.id);
            } else if (op.type === 'remove') {
              outSet.delete(op.id);
            }
          }

          const prevOut = outMap.get(seg.id);
          let changed = false;
          if (!prevOut || prevOut.size !== outSet.size) {
            changed = true;
          } else {
            for (const item of outSet) {
              if (!prevOut.has(item)) {
                changed = true;
                break;
              }
            }
          }

          if (changed) {
            outMap.set(seg.id, outSet);
            for (const next of seg.nextSegments) {
              if (next.reachable && !inWorklist.has(next.id)) {
                worklist.push(next);
                inWorklist.add(next.id);
              }
            }
          }
        }

        const leakedIds = new Set<string>();
        for (const finalSeg of codePath.finalSegments) {
          if (finalSeg.reachable) {
            const finalOut = outMap.get(finalSeg.id);
            if (finalOut) {
              for (const id of finalOut) {
                leakedIds.add(id);
              }
            }
          }
        }

        // Check loop back edges
        for (const edge of fn.loopBackEdges) {
          const fromOut = outMap.get(edge.from);
          if (fromOut) {
            for (const id of fromOut) {
              leakedIds.add(id);
            }
          }
        }

        for (const id of fn.reassignedListeners) {
          leakedIds.add(id);
        }

        for (const id of leakedIds) {
          const reg = fn.registrations.get(id);
          if (reg) {
            if (isProtectedByFinally(reg.node, reg.fnName, reg.signalKey, context)) {
              continue;
            }
            context.report({
              node: reg.node,
              messageId: 'leakedAbortListener',
              data: {
                name: reg.fnName,
                signal: reg.signalKey,
              },
            });
          }
        }
      },

      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type !== AST_NODE_TYPES.MemberExpression ||
          node.callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }

        const methodName = node.callee.property.name;
        if (methodName !== 'addEventListener' && methodName !== 'removeEventListener') {
          return;
        }

        if (node.arguments.length < 2) {
          return;
        }

        const arg0 = node.arguments[0];
        const isAbort =
          (arg0.type === AST_NODE_TYPES.Literal && arg0.value === 'abort') ||
          (arg0.type === AST_NODE_TYPES.TemplateLiteral &&
            arg0.quasis.length === 1 &&
            arg0.quasis[0].value.raw === 'abort');
        if (!isAbort) {
          return;
        }

        const fn = currentFn();
        if (!fn) {
          return;
        }

        if (isInsideTrackedExecutor(node, context)) {
          return;
        }

        if (isLocallyCreatedSignal(node.callee.object, fn.fnNode, context)) {
          return;
        }

        if (methodName === 'addEventListener') {
          if (hasOnceOption(node.arguments[2])) {
            return;
          }

          const fnArg = node.arguments[1];
          if (
            fnArg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            fnArg.type === AST_NODE_TYPES.FunctionExpression
          ) {
            context.report({
              node,
              messageId: 'inlineListenerNoOnce',
            });
            return;
          }

          if (fnArg.type === AST_NODE_TYPES.Identifier) {
            const signalKey = context.sourceCode.getText(node.callee.object);
            const fnName = fnArg.name;
            const id = `${signalKey}:${fnName}`;

            const scope = context.sourceCode.getScope(fnArg);
            const v = findVariable(fnName, scope);
            if (v?.references.some((r) => r.isWrite() && r.identifier !== v.defs[0]?.name)) {
              fn.reassignedListeners.add(id);
            }

            const reg: Registration = {
              id,
              signalKey,
              fnName,
              node,
            };
            fn.registrations.set(id, reg);

            if (fn.currentSegment) {
              const ops = fn.segmentOps.get(fn.currentSegment.id) ?? [];
              ops.push({ type: 'add', id, reg });
              fn.segmentOps.set(fn.currentSegment.id, ops);
            }
          }
        } else if (methodName === 'removeEventListener') {
          const fnArg = node.arguments[1];
          if (fnArg.type === AST_NODE_TYPES.Identifier) {
            const signalKey = context.sourceCode.getText(node.callee.object);
            const fnName = fnArg.name;
            const id = `${signalKey}:${fnName}`;

            if (fn.currentSegment) {
              const ops = fn.segmentOps.get(fn.currentSegment.id) ?? [];
              ops.push({ type: 'remove', id });
              fn.segmentOps.set(fn.currentSegment.id, ops);
            }
          }
        }
      },
    } as unknown as TSESLint.RuleListener;
  },
});
