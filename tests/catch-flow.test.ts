import tseslintParser from '@typescript-eslint/parser';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
import { describe, expect, it } from 'vitest';

import {
  analyzeHandler,
  type AnalyzeHandlerOptions,
  getCatchSites,
  type HandlerAnalysis,
  isCancelableFlowCatch,
} from '../src/util/catch-flow.js';
import { getCancSettings, type ResolvedCancSettings } from '../src/util/settings.js';
import { ruleTester } from './setup.js';

const IMPORT_PREAMBLE = `
import { CancelablePromise, isCancelError, suppressCancel } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { suppressErrors, TimeoutError, createIsError } from '@cancjs/toolbox';

declare const catalogSearch: CancelablePromise<number>;
declare const nativeSearch: Promise<number>;
declare function render(n: number): void;
declare function toast(err: unknown): void;
declare function handleError(err: unknown): void;
declare class WrapError extends Error {
  constructor(cause: unknown);
}
`;

function parseAndAnalyze(
  code: string,
  opts?: AnalyzeHandlerOptions,
  settingsOverrides?: Partial<ResolvedCancSettings>,
): HandlerAnalysis {
  let result: HandlerAnalysis | null = null;
  const linter = new Linter();
  linter.verify(code, {
    languageOptions: { parser: tseslintParser, sourceType: 'module' },
    plugins: {
      probe: {
        rules: {
          capture: {
            meta: { type: 'problem', messages: { x: 'x' }, schema: [] },
            create(context: TSESLint.RuleContext<string, unknown[]>) {
              const baseSettings = getCancSettings(context);
              const settings: ResolvedCancSettings = {
                ...baseSettings,
                ...settingsOverrides,
                boundaryFunctions: [...baseSettings.boundaryFunctions, ...(settingsOverrides?.boundaryFunctions ?? [])],
              };

              return {
                CatchClause(node: TSESTree.CatchClause) {
                  if (!result) {
                    result = analyzeHandler(node, context, settings, opts);
                  }
                },
                CallExpression(node: TSESTree.CallExpression) {
                  if (result) {
                    return;
                  }
                  if (
                    node.callee.type === AST_NODE_TYPES.MemberExpression &&
                    node.callee.property.type === AST_NODE_TYPES.Identifier &&
                    (node.callee.property.name === 'catch' || node.callee.property.name === 'then')
                  ) {
                    const argIndex = node.callee.property.name === 'catch' ? 0 : 1;
                    const arg = node.arguments[argIndex];
                    if (
                      arg &&
                      (arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        arg.type === AST_NODE_TYPES.FunctionExpression)
                    ) {
                      result = analyzeHandler(arg, context, settings, opts);
                    }
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: { 'probe/capture': 'error' },
  });

  if (!result) {
    throw new Error(`No handler found in snippet: ${code}`);
  }
  return result;
}

describe('analyzeHandler scenario table', () => {
  const table = [
    {
      scenario: 'guard (rethrowing)',
      code: `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (isCancelError(err)) {
    throw err;
  }
  toast(err);
}`,
      opts: undefined,
      settings: undefined,
      expected: {
        compliant: true,
        via: 'guard' as const,
        wrapped: false,
        destructured: false,
      },
    },
    {
      scenario: 'guard-then-return',
      code: `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (isCancelError(err)) {
    return;
  }
  toast(err);
}`,
      opts: undefined,
      settings: undefined,
      expected: {
        compliant: false,
        via: null,
        wrapped: false,
        destructured: false,
      },
    },
    {
      scenario: 'rethrow',
      code: `${IMPORT_PREAMBLE}
try {} catch (err) {
  toast(err);
  throw err;
}`,
      opts: undefined,
      settings: undefined,
      expected: {
        compliant: true,
        via: 'rethrow' as const,
        wrapped: false,
        destructured: false,
      },
    },
    {
      scenario: 'boundary',
      code: `${IMPORT_PREAMBLE}
try {} catch (err) {
  suppressCancel(err);
}`,
      opts: undefined,
      settings: undefined,
      expected: {
        compliant: true,
        via: 'boundary' as const,
        wrapped: false,
        destructured: false,
      },
    },
    {
      scenario: 'logReturn',
      code: `${IMPORT_PREAMBLE}
try {} catch (err) {
  console.error(err);
  return;
}`,
      opts: { allowLogAndReturn: true },
      settings: undefined,
      expected: {
        compliant: true,
        via: 'logReturn' as const,
        wrapped: false,
        destructured: false,
      },
    },
    {
      scenario: 'wrapped rethrow',
      code: `${IMPORT_PREAMBLE}
try {} catch (err) {
  throw new WrapError(err);
}`,
      opts: undefined,
      settings: undefined,
      expected: {
        compliant: false,
        via: null,
        wrapped: true,
        destructured: false,
      },
    },
    {
      scenario: 'destructured param',
      code: `${IMPORT_PREAMBLE}
try {} catch ({ message }) {
  toast(message);
}`,
      opts: undefined,
      settings: undefined,
      expected: {
        compliant: false,
        via: null,
        wrapped: false,
        destructured: true,
      },
    },
  ];

  it.each(table)('$scenario', ({ code, opts, settings, expected }) => {
    const analysis = parseAndAnalyze(code, opts, settings);
    expect(analysis.compliant).toBe(expected.compliant);
    expect(analysis.via).toBe(expected.via);
    expect(analysis.wrapped).toBe(expected.wrapped);
    expect(analysis.destructured).toBe(expected.destructured);
  });
});

describe('analyzeHandler edge cases', () => {
  it('passes negated guard with alternate rethrow', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (!isCancelError(err)) {
    toast(err);
  } else {
    throw err;
  }
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('guard');
  });

  it('rejects negated guard without rethrow', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (!isCancelError(err)) {
    toast(err);
  }
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(false);
    expect(analysis.via).toBeNull();
  });

  it('passes boundary call with matcher helper', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  suppressErrors(err, TimeoutError);
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('boundary');
  });

  it('passes custom boundary configured in settings', () => {
    const code = `${IMPORT_PREAMBLE}
declare function myCustomBoundary(e: unknown): void;
try {} catch (err) {
  myCustomBoundary(err);
}`;
    const analysis = parseAndAnalyze(code, undefined, {
      boundaryFunctions: ['myCustomBoundary'],
    });
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('boundary');
  });

  it('passes rethrow in if-else alternate branch', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (err instanceof TypeError) {
    toast(err);
  } else {
    throw err;
  }
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('rethrow');
  });

  it('passes rethrow in the final else of an else-if chain', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (err instanceof TypeError) {
    toast(err);
  } else if (err instanceof RangeError) {
    toast(err);
  } else {
    throw err;
  }
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('rethrow');
  });

  it('rejects an else-if chain without a final rethrow', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (err instanceof TypeError) {
    toast(err);
  } else if (err instanceof RangeError) {
    toast(err);
  }
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(false);
  });

  it('passes a coroutine rethrow through the throw helper', () => {
    const code = `${IMPORT_PREAMBLE}
import { cancThrow as fail } from '@cancjs/coroutine';
cancAsync(function* () {
  try {} catch (err) {
    toast(err);
    return yield* fail(err);
  }
});`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('rethrow');
  });

  it('passes a guard whose cancel branch rethrows through the throw helper', () => {
    const code = `${IMPORT_PREAMBLE}
import { cancThrow } from '@cancjs/coroutine';
cancAsync(function* () {
  try {} catch (err) {
    if (isCancelError(err)) {
      yield* cancThrow(err);
    }
    toast(err);
  }
});`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('guard');
  });

  it('rejects a throw helper call that throws something else', () => {
    const code = `${IMPORT_PREAMBLE}
import { cancThrow } from '@cancjs/coroutine';
cancAsync(function* () {
  try {} catch (err) {
    toast(err);
    return yield* cancThrow(new Error('failed'));
  }
});`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(false);
  });

  it('passes rethrowing guard followed by wrapped rethrow', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  if (isCancelError(err)) {
    throw err;
  }
  throw new WrapError(err);
}`;
    const analysis = parseAndAnalyze(code);
    expect(analysis.compliant).toBe(true);
    expect(analysis.via).toBe('guard');
    expect(analysis.wrapped).toBe(false);
  });

  it('rejects log statements when allowLogAndReturn is false', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch (err) {
  console.error(err);
  return;
}`;
    const analysis = parseAndAnalyze(code, { allowLogAndReturn: false });
    expect(analysis.compliant).toBe(false);
    expect(analysis.via).toBeNull();
  });

  it('handles empty catch clauses', () => {
    const code = `${IMPORT_PREAMBLE}
try {} catch {}`;
    const analysisDefault = parseAndAnalyze(code, { allowEmptyCatch: false });
    expect(analysisDefault.compliant).toBe(false);

    const analysisAllowed = parseAndAnalyze(code, { allowEmptyCatch: true });
    expect(analysisAllowed.compliant).toBe(true);
  });

  it('analyzes concise arrow rejection callback body', () => {
    const boundaryCode = `${IMPORT_PREAMBLE}
catalogSearch.catch((err) => suppressCancel(err));`;
    const boundaryAnalysis = parseAndAnalyze(boundaryCode);
    expect(boundaryAnalysis.compliant).toBe(true);
    expect(boundaryAnalysis.via).toBe('boundary');

    const fallbackCode = `${IMPORT_PREAMBLE}
catalogSearch.catch(() => 0);`;
    const fallbackAnalysis = parseAndAnalyze(fallbackCode);
    expect(fallbackAnalysis.compliant).toBe(false);
    expect(fallbackAnalysis.via).toBeNull();
  });
});

type ProbeMessages =
  | 'siteClause'
  | 'siteCallback'
  | 'noSite'
  | 'compliantGuard'
  | 'compliantRethrow'
  | 'compliantBoundary'
  | 'compliantLogReturn'
  | 'guardThenReturn'
  | 'wrappedRethrow'
  | 'destructuredCatch'
  | 'swallowed';

const probeRule: TSESLint.RuleModule<ProbeMessages, [AnalyzeHandlerOptions?]> = {
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: { description: 'probe catch-flow helper behavior' },
    messages: {
      siteClause: 'siteClause',
      siteCallback: 'siteCallback',
      noSite: 'noSite',
      compliantGuard: 'compliantGuard',
      compliantRethrow: 'compliantRethrow',
      compliantBoundary: 'compliantBoundary',
      compliantLogReturn: 'compliantLogReturn',
      guardThenReturn: 'guardThenReturn',
      wrappedRethrow: 'wrappedRethrow',
      destructuredCatch: 'destructuredCatch',
      swallowed: 'swallowed',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowLogAndReturn: { type: 'boolean' },
          allowEmptyCatch: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: TSESLint.RuleContext<ProbeMessages, [AnalyzeHandlerOptions?]>) {
    const settings = getCancSettings(context);
    const opts = context.options[0] ?? {};

    function inspect(node: TSESTree.Node): void {
      const sites = getCatchSites(node, context, settings);
      if (sites.length === 0) {
        context.report({ node, messageId: 'noSite' });
        return;
      }

      for (const site of sites) {
        if (site.kind === 'clause') {
          context.report({ node: site.flowNode, messageId: 'siteClause' });
          if (site.handler.type === AST_NODE_TYPES.CatchClause) {
            expect(isCancelableFlowCatch(site.handler, context, settings)).toBe(true);
          }
        } else {
          context.report({ node: site.flowNode, messageId: 'siteCallback' });
        }

        const analysis = analyzeHandler(site.handler, context, settings, opts);
        if (analysis.wrapped && !analysis.compliant) {
          context.report({ node: site.flowNode, messageId: 'wrappedRethrow' });
        } else if (analysis.destructured) {
          context.report({ node: site.flowNode, messageId: 'destructuredCatch' });
        } else if (analysis.compliant) {
          if (analysis.via === 'guard') context.report({ node: site.flowNode, messageId: 'compliantGuard' });
          else if (analysis.via === 'rethrow') context.report({ node: site.flowNode, messageId: 'compliantRethrow' });
          else if (analysis.via === 'boundary') context.report({ node: site.flowNode, messageId: 'compliantBoundary' });
          else if (analysis.via === 'logReturn')
            context.report({ node: site.flowNode, messageId: 'compliantLogReturn' });
        } else {
          context.report({ node: site.flowNode, messageId: 'swallowed' });
        }
      }
    }

    return {
      TryStatement(node) {
        inspect(node);
      },
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          (node.callee.property.name === 'catch' || node.callee.property.name === 'then')
        ) {
          inspect(node);
        }
      },
    };
  },
};

describe('getCatchSites and isCancelableFlowCatch: typed lane', () => {
  ruleTester().run('probe-typed', probeRule, {
    valid: [],
    invalid: [
      {
        // Cancelable chain with inline handler -> siteCallback + compliantGuard
        code: `${IMPORT_PREAMBLE}
catalogSearch.catch((err) => {
  if (isCancelError(err)) throw err;
});`,
        errors: [{ messageId: 'siteCallback' }, { messageId: 'compliantGuard' }],
      },
      {
        // Cancelable chain with handler by reference -> no site
        code: `${IMPORT_PREAMBLE}
catalogSearch.catch(handleError);`,
        errors: [{ messageId: 'noSite' }],
      },
      {
        // Native promise chain -> no site
        code: `${IMPORT_PREAMBLE}
nativeSearch.catch((err) => {
  toast(err);
});`,
        errors: [{ messageId: 'noSite' }],
      },
      {
        // Coroutine try-catch with yield* cancAwait -> siteClause + compliantGuard
        code: `${IMPORT_PREAMBLE}
const fn = cancAsync(function* () {
  try {
    const res = yield* cancAwait(catalogSearch);
    render(res);
  } catch (err) {
    if (isCancelError(err)) throw err;
  }
});`,
        errors: [{ messageId: 'siteClause' }, { messageId: 'compliantGuard' }],
      },
      {
        // Try-catch without cancelable expression -> no site
        code: `${IMPORT_PREAMBLE}
try {
  toast(1);
} catch (err) {
  toast(err);
}`,
        errors: [{ messageId: 'noSite' }],
      },
      {
        // .then with rejection handler
        code: `${IMPORT_PREAMBLE}
catalogSearch.then(render, (err) => {
  suppressCancel(err);
});`,
        errors: [{ messageId: 'siteCallback' }, { messageId: 'compliantBoundary' }],
      },
      {
        // Wrapped rethrow in catch clause
        code: `${IMPORT_PREAMBLE}
const fn = cancAsync(function* () {
  try {
    const res = yield* cancAwait(catalogSearch);
    render(res);
  } catch (err) {
    throw new WrapError(err);
  }
});`,
        errors: [{ messageId: 'siteClause' }, { messageId: 'wrappedRethrow' }],
      },
    ],
  });
});

describe('getCatchSites and isCancelableFlowCatch: untyped degrade lane', () => {
  ruleTester({ types: false }).run('probe-untyped', probeRule, {
    valid: [],
    invalid: [
      {
        // Untyped identifier promise chain -> no site
        code: `${IMPORT_PREAMBLE}
catalogSearch.catch((err) => {
  toast(err);
});`,
        errors: [{ messageId: 'noSite' }],
      },
      {
        // Tracked constructor chain in SYN mode -> siteCallback
        code: `${IMPORT_PREAMBLE}
new CancelablePromise<number>((resolve) => resolve(1)).catch((err) => {
  suppressCancel(err);
});`,
        errors: [{ messageId: 'siteCallback' }, { messageId: 'compliantBoundary' }],
      },
      {
        // Tracked cancAwait step inside coroutine -> siteClause
        code: `${IMPORT_PREAMBLE}
const fn = cancAsync(function* () {
  try {
    yield* cancAwait(catalogSearch);
  } catch (err) {
    if (isCancelError(err)) throw err;
  }
});`,
        errors: [{ messageId: 'siteClause' }, { messageId: 'compliantGuard' }],
      },
    ],
  });
});
