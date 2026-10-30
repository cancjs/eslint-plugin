import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';

import { refersTo } from '../util/canc-imports.js';
import createRule from '../util/create-rule.js';
import { analyzeExecutor } from '../util/executor.js';

const { DefinitionType } = TSESLint.Scope;

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
  matchKey: string;
  signalKey: string;
  fnName: string;
  node: TSESTree.CallExpression;
}

interface SegmentOp {
  type: 'add' | 'remove';
  id?: string;
  matchKey?: string;
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

function isAbortSignalCreator(node: TSESTree.Node, context: TSESLint.RuleContext<MessageIds, RuleOptions>): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (refersTo(node.callee, context, 'createAbortSignal') || refersTo(node.callee, context, 'createCancelSignal')) {
    return true;
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
        if (isAbortSignalCreator(init, context)) {
          return true;
        }
        if (init.type === AST_NODE_TYPES.Identifier) {
          const cVar = findVariable(init.name, scope);
          if (cVar) {
            for (const cDef of cVar.defs) {
              if (cDef.node.type === AST_NODE_TYPES.VariableDeclarator && cDef.node.init) {
                let cInit = cDef.node.init;
                while (
                  cInit.type === AST_NODE_TYPES.TSAsExpression ||
                  cInit.type === AST_NODE_TYPES.TSTypeAssertion ||
                  cInit.type === AST_NODE_TYPES.TSNonNullExpression
                ) {
                  cInit = cInit.expression;
                }
                if (
                  cInit.type === AST_NODE_TYPES.NewExpression &&
                  cInit.callee.type === AST_NODE_TYPES.Identifier &&
                  cInit.callee.name === 'AbortController'
                ) {
                  return true;
                }
                if (isAbortSignalCreator(cInit, context)) {
                  return true;
                }
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
        if (isAbortSignalCreator(init, context)) {
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
              if (cDef.node.type === AST_NODE_TYPES.VariableDeclarator && cDef.node.init) {
                let cInit = cDef.node.init;
                while (
                  cInit.type === AST_NODE_TYPES.TSAsExpression ||
                  cInit.type === AST_NODE_TYPES.TSTypeAssertion ||
                  cInit.type === AST_NODE_TYPES.TSNonNullExpression
                ) {
                  cInit = cInit.expression;
                }
                if (
                  cInit.type === AST_NODE_TYPES.NewExpression &&
                  cInit.callee.type === AST_NODE_TYPES.Identifier &&
                  cInit.callee.name === 'AbortController'
                ) {
                  return true;
                }
                if (isAbortSignalCreator(cInit, context)) {
                  return true;
                }
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

function matchesRemovalCall(
  node: TSESTree.Node,
  signalKey: string,
  fnName: string,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  let expr = node;
  while (
    expr.type === AST_NODE_TYPES.TSAsExpression ||
    expr.type === AST_NODE_TYPES.TSTypeAssertion ||
    expr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    expr = expr.expression;
  }

  if (expr.type === AST_NODE_TYPES.UnaryExpression && expr.operator === 'void') {
    expr = expr.argument;
  }

  if (expr.type === AST_NODE_TYPES.ChainExpression) {
    expr = expr.expression;
  }

  if (
    expr.type === AST_NODE_TYPES.CallExpression &&
    expr.callee.type === AST_NODE_TYPES.MemberExpression &&
    expr.callee.property.type === AST_NODE_TYPES.Identifier &&
    expr.callee.property.name === 'removeEventListener' &&
    expr.arguments.length >= 2
  ) {
    const arg0 = expr.arguments[0];
    const isAbort =
      (arg0.type === AST_NODE_TYPES.Literal && arg0.value === 'abort') ||
      (arg0.type === AST_NODE_TYPES.TemplateLiteral &&
        arg0.quasis.length === 1 &&
        arg0.quasis[0].value.raw === 'abort');
    if (isAbort) {
      const sig = context.sourceCode.getText(expr.callee.object);
      const fnArg = expr.arguments[1];
      if (sig === signalKey && fnArg.type === AST_NODE_TYPES.Identifier && fnArg.name === fnName) {
        return true;
      }
    }
  }
  return false;
}

const JUMP_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
]);

function isFunctionNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

const LOOP_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

interface JumpScope {
  inLoop: boolean;
  inSwitch: boolean;
  labels: ReadonlySet<string>;
}

const OUTER_SCOPE: JumpScope = { inLoop: false, inSwitch: false, labels: new Set() };

// a break or continue whose target lies inside the scanned statement stays local
function isLocalJump(node: TSESTree.Node, scope: JumpScope): boolean {
  if (node.type === AST_NODE_TYPES.BreakStatement) {
    return node.label ? scope.labels.has(node.label.name) : scope.inLoop || scope.inSwitch;
  }
  if (node.type === AST_NODE_TYPES.ContinueStatement) {
    return node.label ? scope.labels.has(node.label.name) : scope.inLoop;
  }
  return false;
}

function innerScope(node: TSESTree.Node, scope: JumpScope): JumpScope {
  if (LOOP_TYPES.has(node.type)) {
    return { ...scope, inLoop: true };
  }
  if (node.type === AST_NODE_TYPES.SwitchStatement) {
    return { ...scope, inSwitch: true };
  }
  if (node.type === AST_NODE_TYPES.LabeledStatement) {
    return { ...scope, labels: new Set([...scope.labels, node.label.name]) };
  }
  return scope;
}

function mayJump(node: TSESTree.Node, scope: JumpScope = OUTER_SCOPE): boolean {
  if (JUMP_TYPES.has(node.type)) {
    return !isLocalJump(node, scope);
  }
  if (isFunctionNode(node)) {
    return false;
  }
  const childScope = innerScope(node, scope);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') {
      continue;
    }
    const children: unknown[] = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === 'object' && 'type' in child && mayJump(child as TSESTree.Node, childScope)) {
        return true;
      }
    }
  }
  return false;
}

function isRemovalStatement(
  stmt: TSESTree.Statement | undefined,
  fnName: string,
  signalKey: string,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  return (
    stmt?.type === AST_NODE_TYPES.ExpressionStatement && matchesRemovalCall(stmt.expression, signalKey, fnName, context)
  );
}

function finallyRemovesListener(
  finalizer: TSESTree.BlockStatement,
  fnName: string,
  signalKey: string,
  context: TSESLint.RuleContext<MessageIds, RuleOptions>,
): boolean {
  for (const stmt of finalizer.body) {
    if (isRemovalStatement(stmt, fnName, signalKey, context)) {
      return true;
    }
    // a nested try only guarantees a removal that nothing before it can throw past
    if (
      stmt.type === AST_NODE_TYPES.TryStatement &&
      isRemovalStatement(stmt.block.body[0], fnName, signalKey, context)
    ) {
      return true;
    }
    if (mayJump(stmt)) {
      return false;
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
  while (curr && !isFunctionNode(curr)) {
    if (
      curr.type === AST_NODE_TYPES.TryStatement &&
      curr.finalizer &&
      isDescendant(regNode, curr.block) &&
      finallyRemovesListener(curr.finalizer, fnName, signalKey, context)
    ) {
      return true;
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
      leakedAbortListener:
        "This 'abort' listener is not removed on every path out of the function, so listeners pile up on a long-lived signal. Remove it in a 'finally' block or register it with '{ once: true }'.",
      inlineListenerNoOnce:
        "An inline listener cannot be removed later. Register it with '{ once: true }' or keep a reference and call 'removeEventListener'.",
    },
  },
  defaultOptions: [],
  create(context) {
    let nextRegId = 1;
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
            if (op.type === 'add' && op.id) {
              outSet.add(op.id);
            } else if (op.type === 'remove' && op.matchKey) {
              for (const regId of Array.from(outSet)) {
                const reg = fn.registrations.get(regId);
                if (reg && reg.matchKey === op.matchKey) {
                  outSet.delete(regId);
                }
              }
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
            const matchKey = `${signalKey}:${fnName}`;
            const id = `${matchKey}:${nextRegId++}`;

            const scope = context.sourceCode.getScope(fnArg);
            const v = findVariable(fnName, scope);
            if (v?.references.some((r) => r.isWrite() && r.identifier !== v.defs[0]?.name)) {
              fn.reassignedListeners.add(id);
            }

            const reg: Registration = {
              id,
              matchKey,
              signalKey,
              fnName,
              node,
            };
            fn.registrations.set(id, reg);

            if (fn.currentSegment) {
              const ops = fn.segmentOps.get(fn.currentSegment.id) ?? [];
              ops.push({ type: 'add', id, matchKey, reg });
              fn.segmentOps.set(fn.currentSegment.id, ops);
            }
          }
        } else if (methodName === 'removeEventListener') {
          const fnArg = node.arguments[1];
          if (fnArg.type === AST_NODE_TYPES.Identifier) {
            const signalKey = context.sourceCode.getText(node.callee.object);
            const fnName = fnArg.name;
            const matchKey = `${signalKey}:${fnName}`;

            if (fn.currentSegment) {
              const ops = fn.segmentOps.get(fn.currentSegment.id) ?? [];
              ops.push({ type: 'remove', matchKey });
              fn.segmentOps.set(fn.currentSegment.id, ops);
            }
          }
        }
      },
    } as unknown as TSESLint.RuleListener;
  },
});
