import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { getCancBindings, refersTo } from '../util/canc-imports.js';
import { analyzeHandler, type CatchSite, getCatchSites } from '../util/catch-flow.js';
import createRule from '../util/create-rule.js';
import { getCancSettings } from '../util/settings.js';

export type MessageIds = 'swallowedCancel' | 'wrappedRethrow' | 'destructuredCatch' | 'suggestRethrowCancel';

export interface Options {
  allowLogAndReturn?: boolean;
  allowEmptyCatch?: boolean;
}

export type RuleOptions = [Options];

type Context = Readonly<TSESLint.RuleContext<MessageIds, RuleOptions>>;

function isFunctionLike(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isAstNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && 'type' in value;
}

// walks the handler body without entering nested functions, which have their own exits
function walkBody(node: TSESTree.Node, visit: (node: TSESTree.Node) => void): void {
  visit(node);
  for (const key of Object.keys(node) as (keyof TSESTree.Node)[]) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key] as unknown;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (isAstNode(child) && !isFunctionLike(child)) {
        walkBody(child, visit);
      }
    }
  }
}

function mentionsName(node: TSESTree.Node, name: string): boolean {
  let found = false;
  walkBody(node, (inner) => {
    if (inner.type === AST_NODE_TYPES.Identifier && inner.name === name) {
      found = true;
    }
  });
  return found;
}

function findWrappingThrow(body: TSESTree.BlockStatement, paramName: string): TSESTree.ThrowStatement | null {
  let wrapping: TSESTree.ThrowStatement | null = null;
  walkBody(body, (node) => {
    if (wrapping || node.type !== AST_NODE_TYPES.ThrowStatement) {
      return;
    }
    const argument = node.argument;
    if (
      (argument.type === AST_NODE_TYPES.NewExpression || argument.type === AST_NODE_TYPES.CallExpression) &&
      argument.arguments.some((arg) => mentionsName(arg, paramName))
    ) {
      wrapping = node;
    }
  });
  return wrapping;
}

function hasCancelGuard(body: TSESTree.BlockStatement, paramName: string, context: Context): boolean {
  let found = false;
  walkBody(body, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      refersTo(node.callee, context, 'isCancelError') &&
      node.arguments[0]?.type === AST_NODE_TYPES.Identifier &&
      node.arguments[0].name === paramName
    ) {
      found = true;
    }
  });
  return found;
}

// local text that calls the tracked isCancelError binding, or null when none is in scope
function isCancelErrorReference(scopeNode: TSESTree.Node, context: Context): string | null {
  for (const [localName, binding] of getCancBindings(context)) {
    const exportName = binding.namespace ? null : binding.exported;
    const text = binding.namespace ? `${localName}.isCancelError` : localName;
    if (exportName !== null && exportName !== 'isCancelError') {
      continue;
    }
    let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(scopeNode);
    let resolved: TSESLint.Scope.Variable | undefined;
    while (scope && !resolved) {
      resolved = scope.set.get(localName);
      scope = scope.upper;
    }
    // a closer declaration of the same name shadows the import
    if (resolved?.scope.block.type === AST_NODE_TYPES.Program) {
      return text;
    }
  }
  return null;
}

function reportNodeOf(site: CatchSite, context: Context): TSESTree.Node | TSESTree.SourceLocation {
  if (site.kind === 'callback') {
    return site.handler;
  }
  return context.sourceCode.getFirstToken(site.handler)?.loc ?? site.handler.loc;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-swallowed-cancel',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow catch handlers on cancelable flows that swallow the cancellation',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowLogAndReturn: {
            type: 'boolean',
            description: 'Allow handlers whose statements are only logging calls and a return.',
          },
          allowEmptyCatch: {
            type: 'boolean',
            description: 'Allow empty catch blocks and empty rejection handlers.',
          },
        },
      },
    ],
    defaultOptions: [{ allowLogAndReturn: false, allowEmptyCatch: false }],
    messages: {
      swallowedCancel:
        "This catch handler also receives CancelError and treats it like a failure, so a canceled operation shows an error or retries. Check 'isCancelError({{param}})' and rethrow it (returning from the check still swallows the cancel), or consume the promise with 'catchCancel' or 'suppressCancel' at the end of the flow.",
      wrappedRethrow:
        "Wrapping the caught error in a new error loses the cancellation identity, so callers can no longer tell a cancel from a failure. Rethrow the original error, or check 'isCancelError({{param}})' before wrapping.",
      destructuredCatch:
        "A destructured catch parameter cannot be passed to 'isCancelError'. Bind the whole error, check it with 'isCancelError', then destructure.",
      suggestRethrowCancel: "Rethrow the cancel first with 'if ({{guard}}({{param}})) throw {{param}};'.",
    },
  },
  defaultOptions: [{ allowLogAndReturn: false, allowEmptyCatch: false }],
  create(context, [options]) {
    const settings = getCancSettings(context);
    const analyzeOptions = {
      allowLogAndReturn: options.allowLogAndReturn === true,
      allowEmptyCatch: options.allowEmptyCatch === true,
    };

    function check(site: CatchSite): void {
      const analysis = analyzeHandler(site.handler, context, settings, analyzeOptions);
      if (analysis.compliant) {
        return;
      }

      if (analysis.destructured && site.param) {
        context.report({ node: site.param, messageId: 'destructuredCatch' });
        return;
      }

      const body = site.handler.body;
      const param = analysis.param;
      const paramName = param?.name ?? 'error';

      if (param && body?.type === AST_NODE_TYPES.BlockStatement) {
        const wrapping = findWrappingThrow(body, param.name);
        if (wrapping) {
          context.report({ node: wrapping, messageId: 'wrappedRethrow', data: { param: paramName } });
          return;
        }
      }

      const location = reportNodeOf(site, context);
      const target = 'type' in location ? { node: location } : { loc: location };
      const guard =
        param && body?.type === AST_NODE_TYPES.BlockStatement && !hasCancelGuard(body, param.name, context) ?
          isCancelErrorReference(body, context)
        : null;

      if (!param || body?.type !== AST_NODE_TYPES.BlockStatement || guard === null) {
        context.report({ ...target, messageId: 'swallowedCancel', data: { param: paramName } });
        return;
      }

      const first = body.body.at(0);
      const statement = `if (${guard}(${param.name})) throw ${param.name};`;
      context.report({
        ...target,
        messageId: 'swallowedCancel',
        data: { param: paramName },
        suggest: [
          {
            messageId: 'suggestRethrowCancel',
            data: { guard, param: param.name },
            fix: (fixer) => {
              if (first) {
                const indent = ' '.repeat(first.loc.start.column);
                return fixer.insertTextBefore(first, `${statement}\n${indent}`);
              }
              return fixer.insertTextAfterRange([body.range[0], body.range[0] + 1], ` ${statement} `);
            },
          },
        ],
      });
    }

    function visit(node: TSESTree.TryStatement | TSESTree.CallExpression): void {
      for (const site of getCatchSites(node, context, settings)) {
        check(site);
      }
    }

    return {
      TryStatement: visit,
      CallExpression: visit,
    };
  },
});
