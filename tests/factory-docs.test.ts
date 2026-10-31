import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rules } from '../src/rules/index.js';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rules');

const FACTORY_OPTIONS = [
  'additionalCoroutineFactories',
  'additionalGenCoroutineFactories',
  'coroutineFactories',
  'genCoroutineFactories',
];

interface OptionsSchema {
  properties?: Record<string, unknown>;
}

function schemaProperties(rule: (typeof rules)[keyof typeof rules]): string[] {
  const schema = rule.meta?.schema;
  const first = (Array.isArray(schema) ? schema[0] : schema) as OptionsSchema | undefined;
  return Object.keys(first?.properties ?? {});
}

function defaultsOf(rule: (typeof rules)[keyof typeof rules]): Record<string, unknown> {
  return (rule.meta?.defaultOptions?.[0] ?? {}) as Record<string, unknown>;
}

// Pieces are joined so this file does not trip the sweep it mirrors.
const INTERNAL_WORDS = [
  ['ag', 'ent'],
  ['Cl', 'aude'],
  ['LL', 'M'],
  ['run', 'ner'],
].map((parts) => parts.join(''));
const INTERNAL_PATTERN = new RegExp(
  [
    'EP-D[0-9]',
    String.raw`\bR[0-9]{1,2}\b`,
    'TE-[0-9]',
    String.raw`\bE?P[0-9]+-[0-9]`,
    '[.]cl' + 'aude',
    'phase-[0-9]',
    String.raw`\b(${INTERNAL_WORDS.join('|')})\b`,
  ].join('|'),
);

const factoryRules = Object.entries(rules)
  .filter(([, rule]) => JSON.stringify(rule.meta?.schema ?? []).includes('additionalCoroutineFactories'))
  .map(([name]) => name);

describe('coroutine factory option documentation', () => {
  it('finds the rules that accept the factory options', () => {
    expect(factoryRules.length).toBeGreaterThan(0);
  });

  it.each(factoryRules)('%s schema declares the four factory options', (ruleName) => {
    expect(schemaProperties(rules[ruleName])).toEqual(expect.arrayContaining(FACTORY_OPTIONS));
  });

  it.each(factoryRules)('%s documents every schema option with its default', (ruleName) => {
    const rule = rules[ruleName];
    const page = fs.readFileSync(path.join(docsDir, `${ruleName}.md`), 'utf8');
    const defaults = defaultsOf(rule);
    for (const option of schemaProperties(rule)) {
      const section = new RegExp(String.raw`^### ${option}\r?\n\r?\n([^\r\n]*)`, 'm').exec(page);
      expect(section, `Option '${option}' has no heading in '${ruleName}.md'`).not.toBeNull();
      const expected = option in defaults ? `Default: \`${JSON.stringify(defaults[option])}\`.` : 'Default: not set.';
      expect(section?.[1], `Option '${option}' default in '${ruleName}.md'`).toContain(expected);
    }
  });

  it.each(factoryRules)('%s explains extend, replace and the shared setup', (ruleName) => {
    const page = fs.readFileSync(path.join(docsDir, `${ruleName}.md`), 'utf8');
    expect(page, `'${ruleName}.md' does not explain extend`).toMatch(/\bextend\b/i);
    expect(page, `'${ruleName}.md' does not explain replace`).toMatch(/\breplace\b/i);
    expect(page, `'${ruleName}.md' does not say an empty list turns the built-in off`).toContain(
      'An empty list turns the built-in off',
    );
    expect(page, `'${ruleName}.md' does not say to share the options`).toContain(
      'Set the same factory options on every coroutine rule',
    );
    expect(page, `'${ruleName}.md' does not describe object entry forms`).toContain('namespace import');
    expect(page, `'${ruleName}.md' still calls a variable generator unresolved`).not.toContain(
      'a variable passed in place of the generator',
    );
  });

  it.each(factoryRules)('%s page contains no internal references', (ruleName) => {
    const page = fs.readFileSync(path.join(docsDir, `${ruleName}.md`), 'utf8');
    expect(page).not.toMatch(INTERNAL_PATTERN);
  });
});
