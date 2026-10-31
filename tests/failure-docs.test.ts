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

function collectNestedPropertyNames(node: unknown, depth = 0): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  const names: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'properties' && value && typeof value === 'object') {
      if (depth > 0) {
        names.push(...Object.keys(value));
      }
      for (const child of Object.values(value as Record<string, unknown>)) {
        names.push(...collectNestedPropertyNames(child, depth + 1));
      }
    } else {
      names.push(...collectNestedPropertyNames(value, depth));
    }
  }
  return names;
}

function extractDocOptionHeadings(content: string): string[] {
  const optionsSection = content.split(/^## Options\s*$/m)[1];
  if (!optionsSection) {
    return [];
  }
  const nextH2 = optionsSection.split(/^## /m)[0];
  const matches = nextH2.matchAll(/^### ([a-zA-Z0-9_$]+)\s*$/gm);
  return Array.from(matches, (m) => m[1]);
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

  it('every key in rule meta.schema option properties matches doc option headings 1-to-1', () => {
    for (const ruleName of FAILURE_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');

      const rule = (rules as Record<string, { meta?: { schema?: unknown } }>)[ruleName];
      const schemaOptionKeys = extractSchemaOptionKeys(rule?.meta?.schema).sort();
      const docOptionHeadings = extractDocOptionHeadings(content).sort();

      expect(docOptionHeadings, `Doc page '${ruleName}.md' option headings do not match schema properties`).toEqual(
        schemaOptionKeys,
      );

      if (schemaOptionKeys.length === 0) {
        expect(content, `Doc page '${ruleName}.md' with empty schema must not have an options section`).not.toMatch(
          /^## Options$/m,
        );
      }
    }
  });

  it('names every nested matcher field of each option schema in the rule page', () => {
    for (const ruleName of FAILURE_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');
      const rule = (rules as Record<string, { meta?: { schema?: unknown } }>)[ruleName];
      const nested = [...new Set(collectNestedPropertyNames(rule.meta?.schema))];
      for (const field of nested) {
        expect(content, `Doc page '${ruleName}.md' does not mention matcher field '${field}'`).toContain(
          `\`${field}\``,
        );
      }
    }
  });

  it('require-error-discriminant states that static members are not discriminants', () => {
    const content = fs.readFileSync(path.join(docsDir, 'require-error-discriminant.md'), 'utf8');
    expect(content).toMatch(/static (members|fields)[^.]*(not|never)[^.]*(count|satisfy|discriminant)/i);
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
