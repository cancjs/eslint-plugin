import tseslintParser from '@typescript-eslint/parser';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
import { describe, expect, it } from 'vitest';

import { getCoroutineContext } from '../src/util/canc-imports.js';
import { type FactoryOptions, resolveFactories } from '../src/util/coroutine-factories.js';

// kind of the coroutine context at the PROBE identifier, or null
function probeKind(code: string, options?: FactoryOptions): string | null {
  let result: string | null | undefined;
  const probeRule: TSESLint.RuleModule<'probe', []> = {
    meta: { type: 'problem', messages: { probe: 'probe' }, schema: [] },
    defaultOptions: [],
    create(context) {
      const factories = options ? resolveFactories(options) : undefined;
      return {
        Identifier(node: TSESTree.Identifier) {
          if (node.name === 'PROBE') {
            result =
              (factories ? getCoroutineContext(node, context, factories) : getCoroutineContext(node, context))?.kind ??
              null;
          }
        },
      };
    },
  };
  const linter = new Linter();
  const messages = linter.verify(code, {
    languageOptions: { parser: tseslintParser, sourceType: 'module' },
    plugins: { probe: { rules: { probe: probeRule } } },
    rules: { 'probe/probe': 'error' },
  });
  expect(messages.filter((m) => m.fatal)).toEqual([]);
  expect(result, 'PROBE identifier not reached').not.toBeUndefined();
  return result ?? null;
}

const addAsync = (entry: FactoryOptions['additionalCoroutineFactories']): FactoryOptions => ({
  additionalCoroutineFactories: entry,
});
const reactEntry = { name: 'useX', source: '@cancjs/react' };

interface Row {
  name: string;
  code: string;
  options?: FactoryOptions;
  expected: 'cancAsync' | 'cancGenAsync' | null;
}

const rows: Row[] = [
  {
    name: 'name-only cancAsync entry',
    code: `useX(function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: 'cancAsync',
  },
  {
    name: 'name-only gen entry',
    code: `useX(function* () { PROBE; });`,
    options: { additionalGenCoroutineFactories: ['useX'] },
    expected: 'cancGenAsync',
  },
  {
    name: 'member call with a name-only entry',
    code: `r.useX(function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: 'cancAsync',
  },
  {
    name: 'object entry through a renamed import',
    code: `import { useX as u } from '@cancjs/react'; u(function* () { PROBE; });`,
    options: addAsync([reactEntry]),
    expected: 'cancAsync',
  },
  {
    name: 'object entry through a namespace import',
    code: `import * as r from '@cancjs/react'; r.useX(function* () { PROBE; });`,
    options: addAsync([reactEntry]),
    expected: 'cancAsync',
  },
  {
    name: 'object entry through a require destructure',
    code: `const { useX: u } = require('@cancjs/react'); u(function* () { PROBE; });`,
    options: addAsync([reactEntry]),
    expected: 'cancAsync',
  },
  {
    name: 'object entry through a default import',
    code: `import effect from '@cancjs/react'; effect(function* () { PROBE; });`,
    options: addAsync([{ name: 'default', source: '@cancjs/react' }]),
    expected: 'cancAsync',
  },
  {
    name: 'same name from a different source',
    code: `import { useX } from './local'; useX(function* () { PROBE; });`,
    options: addAsync([reactEntry]),
    expected: null,
  },
  {
    name: 'shadowed local with an object entry',
    code: `import { useX } from '@cancjs/react'; export { useX }; function f(useX) { useX(function* () { PROBE; }); }`,
    options: addAsync([reactEntry]),
    expected: null,
  },
  {
    name: 'shadowed local with a string entry',
    code: `import { useX } from '@cancjs/react'; export { useX }; function f(useX) { useX(function* () { PROBE; }); }`,
    options: addAsync(['useX']),
    expected: 'cancAsync',
  },
  {
    name: 'substring of an entry name',
    code: `useXtra(function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'async arrow argument',
    code: `useX(async () => { PROBE; });`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'async generator argument',
    code: `useX(async function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'non-function argument',
    code: `useX(PROBE);`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'generator in second position',
    code: `useX(deps, function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'no arguments',
    code: `useX(); function* g() { PROBE; }`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'ADD keeps the built-in driver',
    code: `import { cancAsync } from '@cancjs/coroutine'; cancAsync(function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: 'cancAsync',
  },
  {
    name: 'REPLACE drops the built-in driver',
    code: `import { cancAsync } from '@cancjs/coroutine'; cancAsync(function* () { PROBE; });`,
    options: { coroutineFactories: ['onlyMine'] },
    expected: null,
  },
  {
    name: 'REPLACE of the other dialect keeps the built-in driver',
    code: `import { cancAsync } from '@cancjs/coroutine'; cancAsync(function* () { PROBE; });`,
    options: { genCoroutineFactories: ['onlyMine'] },
    expected: 'cancAsync',
  },
  {
    name: 'REPLACE list entry is recognized',
    code: `onlyMine(function* () { PROBE; });`,
    options: { coroutineFactories: ['onlyMine'] },
    expected: 'cancAsync',
  },
  {
    name: 'identifier argument resolves to a generator',
    code: `function* body() { PROBE; } useX(body);`,
    options: addAsync(['useX']),
    expected: 'cancAsync',
  },
  {
    name: 'generator delegated from a configured factory body',
    code: `function* step() { PROBE; } useX(function* () { yield* step(); });`,
    options: { additionalGenCoroutineFactories: ['useX'] },
    expected: 'cancGenAsync',
  },
  {
    name: 'local function named like the built-in is not the built-in',
    code: `function cancAsync(fn) { return fn; } cancAsync(function* () { PROBE; });`,
    options: addAsync(['useX']),
    expected: null,
  },
  {
    name: 'inner require binding another name shadows top import',
    code: `import { useX } from '@cancjs/react'; function f() { const { other: useX } = require('@cancjs/react'); useX(function* () { PROBE; }); }`,
    options: addAsync([reactEntry]),
    expected: null,
  },
  {
    name: 'default import used as namespace',
    code: `import ns from '@cancjs/react'; ns.useX(function* () { PROBE; });`,
    options: addAsync([reactEntry]),
    expected: 'cancAsync',
  },
  {
    name: 'import equals require namespace',
    code: `import r = require('@cancjs/react'); r.useX(function* () { PROBE; });`,
    options: addAsync([reactEntry]),
    expected: 'cancAsync',
  },
  {
    name: 'require inside a function',
    code: `function f() { const { useX } = require('@cancjs/react'); useX(function* () { PROBE; }); }`,
    options: addAsync([reactEntry]),
    expected: 'cancAsync',
  },
];

describe('configurable coroutine factories', () => {
  it.each(rows.map((row) => [row.name, row] as const))('%s', (_name, row) => {
    expect(probeKind(row.code, row.options)).toBe(row.expected);
  });

  it('throws naming an entry listed in both dialects', () => {
    expect(() =>
      resolveFactories({ additionalCoroutineFactories: ['useX'], additionalGenCoroutineFactories: ['useX'] }),
    ).toThrow(/'useX'/);
    expect(() =>
      resolveFactories({ coroutineFactories: [reactEntry], genCoroutineFactories: [{ ...reactEntry }] }),
    ).toThrow(/'useX from @cancjs\/react'/);
  });

  it('rejects a string and an object with the same name across dialects', () => {
    const message = (options: FactoryOptions): string => {
      try {
        resolveFactories(options);
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    };
    const mixed = message({ additionalCoroutineFactories: ['useX'], genCoroutineFactories: [reactEntry] });
    expect(mixed).toContain("'useX from @cancjs/react'");
    expect(mixed).toContain("'additionalCoroutineFactories'");
    expect(mixed).toContain("'genCoroutineFactories'");
    const reversed = message({ coroutineFactories: [reactEntry], additionalGenCoroutineFactories: ['useX'] });
    expect(reversed).toContain("'useX from @cancjs/react'");
    expect(reversed).toContain("'coroutineFactories'");
    expect(reversed).toContain("'additionalGenCoroutineFactories'");
    expect(() =>
      resolveFactories({
        additionalCoroutineFactories: [reactEntry],
        additionalGenCoroutineFactories: [{ name: 'useX', source: '@cancjs/vue' }],
      }),
    ).not.toThrow();
  });

  it('gives two zero-config context rules one shared bag', () => {
    const bags: unknown[] = [];
    const makeRule = (): TSESLint.RuleModule<'probe', [Record<string, unknown>]> => ({
      meta: {
        type: 'problem',
        messages: { probe: 'probe' },
        schema: [{ type: 'object', additionalProperties: true }],
        defaultOptions: [{ allowBareYield: false }],
      },
      defaultOptions: [{ allowBareYield: false }],
      create(context) {
        bags.push(resolveFactories(context.options[0]));
        return {};
      },
    });
    const linter = new Linter();
    linter.verify('const a = 1;', {
      languageOptions: { parser: tseslintParser, sourceType: 'module' },
      plugins: { probe: { rules: { one: makeRule(), two: makeRule() } } },
      rules: { 'probe/one': 'error', 'probe/two': 'error' },
    });
    expect(bags).toHaveLength(2);
    expect(bags[0]).toBe(bags[1]);
    expect(bags[0]).toBe(resolveFactories());
  });

  it('memoizes by options object and shares the zero-config default', () => {
    const options: FactoryOptions = addAsync(['useX']);
    expect(resolveFactories(options)).toBe(resolveFactories(options));
    expect(resolveFactories()).toBe(resolveFactories(undefined));
    expect(resolveFactories()).toEqual({
      cancAsync: [],
      cancGenAsync: [],
      replaceCancAsync: false,
      replaceCancGenAsync: false,
    });
  });

  it('zero-config call equals an explicit default bag', () => {
    const code = `
      import { cancAsync } from '@cancjs/coroutine';
      import { cancGenAsync } from '@cancjs/coroutine/gen';
      cancGenAsync(function* () { PROBE; });
      useX(function* () { yield 1; });
    `;
    expect(probeKind(code)).toBe('cancGenAsync');
    expect(probeKind(code, {})).toBe('cancGenAsync');
  });

  it('throws through linter when an entry is listed in both dialects', () => {
    const makeRule = (): TSESLint.RuleModule<'probe', [FactoryOptions]> => ({
      meta: {
        type: 'problem',
        messages: { probe: 'probe' },
        schema: [{ type: 'object', additionalProperties: true }],
        defaultOptions: [{}],
      },
      defaultOptions: [{}],
      create(context) {
        resolveFactories(context.options[0]);
        return {};
      },
    });
    const linter = new Linter();
    expect(() =>
      linter.verify('const a = 1;', {
        languageOptions: { parser: tseslintParser, sourceType: 'module' },
        plugins: { probe: { rules: { r: makeRule() } } },
        rules: {
          'probe/r': ['error', { additionalCoroutineFactories: ['useX'], additionalGenCoroutineFactories: ['useX'] }],
        },
      }),
    ).toThrow(/listed in both/);
  });
});
