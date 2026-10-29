import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rules } from '../src/rules/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_RULES = [
  'valid-cancasync',
  'no-unstarred-cancawait',
  'prefer-cancawait',
  'no-coroutine-dialect-mismatch',
  'no-cancellation-gap',
  'no-yield-await-in-loop',
  'prefer-cancel-aware-wrapper',
  'no-async-loop-callback',
];

const FALLBACK_SCHEMAS: Record<string, string[]> = {
  'prefer-cancawait': ['allowBareYield'],
};

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

describe('coroutine rule documentation', () => {
  const rootDir = path.resolve(__dirname, '..');
  const docsDir = path.join(rootDir, 'docs', 'rules');

  it('each rule has a markdown page in docs/rules/<name>.md', () => {
    for (const ruleName of EXPECTED_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      expect(fs.existsSync(pagePath), `Doc page missing for rule '${ruleName}': ${pagePath}`).toBe(true);
    }
  });

  it('each page has Incorrect and Correct headings', () => {
    for (const ruleName of EXPECTED_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content, `Doc page '${ruleName}.md' missing '### Incorrect' heading`).toContain('### Incorrect');
      expect(content, `Doc page '${ruleName}.md' missing '### Correct' heading`).toContain('### Correct');
    }
  });

  it('every key in rule meta.schema option properties appears in its doc page', () => {
    for (const ruleName of EXPECTED_RULES) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');

      let optionKeys: string[] = [];
      const rule = (rules as Record<string, { meta?: { schema?: unknown } }>)[ruleName];
      if (rule?.meta?.schema && Array.isArray(rule.meta.schema) && rule.meta.schema.length > 0) {
        optionKeys = extractSchemaOptionKeys(rule.meta.schema);
      } else if (FALLBACK_SCHEMAS[ruleName]) {
        optionKeys = FALLBACK_SCHEMAS[ruleName];
      }

      for (const key of optionKeys) {
        expect(content.includes(key), `Option '${key}' missing in doc page '${ruleName}.md'`).toBe(true);
      }
    }
  });

  it('prefer-cancawait explains yield-vs-yield-star rationale', () => {
    const pagePath = path.join(docsDir, 'prefer-cancawait.md');
    const content = fs.readFileSync(pagePath, 'utf8');
    expect(content).toContain('yield-vs-yield-star');
    expect(content).toContain('Awaited<T>');
  });

  it('strict-tier rules have When not to use it sections', () => {
    const strictRules = ['no-cancellation-gap', 'no-yield-await-in-loop', 'prefer-cancel-aware-wrapper'];
    for (const ruleName of strictRules) {
      const pagePath = path.join(docsDir, `${ruleName}.md`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content, `Strict rule '${ruleName}.md' missing When not to use section`).toContain(
        '## When not to use it',
      );
    }
  });
});
