import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rules } from '../src/rules/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAILURE_RULES = [
  'prefer-canc-throw',
  'canc-throw-tail-position',
  'exhaustive-catch',
  'require-error-discriminant',
  'no-failure-widening',
  'no-throw-in-chain-callback',
];

function extractSchemaOptionKeys(schema: unknown): string[] {
  if (!schema) {
    return [];
  }
  const keys: string[] = [];
  const items = Array.isArray(schema) ? schema : [schema];
  for (const item of items) {
    if (item && typeof item === 'object' && 'properties' in item) {
      const props = (item as { properties?: Record<string, unknown> }).properties;
      if (props && typeof props === 'object') {
        keys.push(...Object.keys(props));
      }
    }
  }
  return keys;
}

describe('failure family rule documentation', () => {
  const rootDir = path.resolve(__dirname, '..');
  const docsDir = path.join(rootDir, 'docs', 'rules');

  it('each failure rule has a markdown page in docs/rules/<name>.md', () => {
    for (const ruleName of FAILURE_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      expect(fs.existsSync(pagePath), `Doc page missing for rule '${ruleName}': ${pagePath}`).toBe(true);
    }
  });

  it('each failure rule doc page has Incorrect and Correct headings', () => {
    for (const ruleName of FAILURE_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content, `Doc page '${ruleName}.md' missing '### Incorrect' heading`).toContain('### Incorrect');
      expect(content, `Doc page '${ruleName}.md' missing '### Correct' heading`).toContain('### Correct');
    }
  });

  it('every key in rule meta.schema option properties appears in its doc page', () => {
    for (const ruleName of FAILURE_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');

      const rule = (rules as Record<string, { meta?: { schema?: unknown } }>)[ruleName];
      const optionKeys = extractSchemaOptionKeys(rule?.meta?.schema);

      for (const key of optionKeys) {
        expect(content.includes(key), `Option '${key}' missing in doc page '${ruleName}.md'`).toBe(true);
      }
    }
  });

  it('documents that CancelError is never reported on prefer-canc-throw and no-throw-in-chain-callback', () => {
    for (const ruleName of ['prefer-canc-throw', 'no-throw-in-chain-callback']) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('CancelError');
      expect(content).toMatch(/CancelError is never reported/i);
    }
  });

  it('documents withFailure forms and guard-as-set on no-failure-widening', () => {
    const pagePath = path.join(docsDir, 'no-failure-widening.md');
    const content = fs.readFileSync(pagePath, 'utf8');
    expect(content).toContain('withFailure');
    expect(content).toContain('guard-as-set');
  });

  it('contains no em dashes in failure rule documentation pages', () => {
    for (const ruleName of FAILURE_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content.includes('\u2014'), `Doc page '${ruleName}.md' contains em dash`).toBe(false);
    }
  });
});
