import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rules } from '../src/rules/index.js';
import { PUBLIC_SUBPATHS } from '../src/util/public-subpaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_RULES = [
  'must-consume-lazy',
  'prefer-signal-option',
  'no-abort-listener-leak',
  'no-internal-imports',
  'no-keyword-alias-import',
  'prefer-signal-accessor',
  'prefer-canceled-property',
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

describe('lazy and hygiene rule documentation', () => {
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
      }

      for (const key of optionKeys) {
        expect(content.includes(key), `Option '${key}' missing in doc page '${ruleName}.md'`).toBe(true);
      }
    }
  });

  it('must-consume-lazy documents execute() and void pitfall', () => {
    const content = fs.readFileSync(path.join(docsDir, 'must-consume-lazy.md'), 'utf8');
    expect(content).toContain('.execute()');
    expect(content).toContain('void');
  });

  it('no-internal-imports documents public subpaths and settings.canc.sources', () => {
    const content = fs.readFileSync(path.join(docsDir, 'no-internal-imports.md'), 'utf8');
    for (const [pkg, subpaths] of Object.entries(PUBLIC_SUBPATHS)) {
      expect(content, `Package '${pkg}' missing in no-internal-imports.md`).toContain(pkg);
      for (const sub of subpaths) {
        const stripped = sub.startsWith('.') ? sub.slice(1) : sub;
        expect(content, `Subpath '${sub}' for '${pkg}' missing in no-internal-imports.md`).toContain(stripped);
      }
    }
    expect(content).toContain('settings.canc.sources');
  });

  it('migration rules document replaced API, minimum version 1.8.0, and 2.0 compatibility', () => {
    const signalAccessor = fs.readFileSync(path.join(docsDir, 'prefer-signal-accessor.md'), 'utf8');
    expect(signalAccessor).toContain('getSignal()');
    expect(signalAccessor).toContain('1.8.0');
    expect(signalAccessor).toContain('2.0');

    const canceledProp = fs.readFileSync(path.join(docsDir, 'prefer-canceled-property.md'), 'utf8');
    expect(canceledProp).toContain('isCanceled');
    expect(canceledProp).toContain('1.8.0');
    expect(canceledProp).toContain('2.0');
  });

  it('strict-tier rule no-abort-listener-leak has When not to use it section', () => {
    const content = fs.readFileSync(path.join(docsDir, 'no-abort-listener-leak.md'), 'utf8');
    expect(content).toContain('## When not to use it');
  });
});
