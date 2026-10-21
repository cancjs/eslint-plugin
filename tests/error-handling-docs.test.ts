import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rules } from '../src/rules/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_RULES = ['no-swallowed-cancel', 'prefer-is-cancel-error'];

const FALLBACK_SCHEMAS: Record<string, string[]> = {
  'no-swallowed-cancel': ['allowLogAndReturn', 'allowEmptyCatch'],
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

describe('error handling rule documentation', () => {
  const rootDir = path.resolve(__dirname, '..');
  const docsDir = path.join(rootDir, 'docs', 'rules');
  const readmePath = path.join(rootDir, 'README.md');

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

  it('README.md has a row for every rule', () => {
    expect(fs.existsSync(readmePath), 'README.md missing').toBe(true);
    const readmeContent = fs.readFileSync(readmePath, 'utf8');

    for (const ruleName of EXPECTED_RULES) {
      const expectedLink = `[\`canc/${ruleName}\`](docs/rules/${ruleName}.md)`;
      expect(readmeContent, `README.md missing table row for rule 'canc/${ruleName}'`).toContain(expectedLink);
    }
  });
});
