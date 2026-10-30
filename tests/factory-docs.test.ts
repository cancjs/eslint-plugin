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

  it.each(factoryRules)('%s documents all four options and the extend and replace behavior', (ruleName) => {
    const page = fs.readFileSync(path.join(docsDir, `${ruleName}.md`), 'utf8');
    for (const option of FACTORY_OPTIONS) {
      expect(page, `Option '${option}' is not a code span in '${ruleName}.md'`).toContain(`\`${option}\``);
    }
    expect(page, `'${ruleName}.md' does not explain extend`).toMatch(/\bextend\b/i);
    expect(page, `'${ruleName}.md' does not explain replace`).toMatch(/\breplace\b/i);
  });

  it.each(factoryRules)('%s page contains no internal references', (ruleName) => {
    const page = fs.readFileSync(path.join(docsDir, `${ruleName}.md`), 'utf8');
    expect(page).not.toMatch(INTERNAL_PATTERN);
  });
});
