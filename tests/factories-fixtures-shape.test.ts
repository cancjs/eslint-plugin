import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index.js';
import { parseMarkerLine } from './helpers/corpus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const factoriesDir = path.resolve(__dirname, 'fixtures/factories');

const FACTORY_OPTION_NAMES = new Set([
  'additionalCoroutineFactories',
  'additionalGenCoroutineFactories',
  'coroutineFactories',
  'genCoroutineFactories',
]);

const knownRuleIds = new Set(Object.keys(plugin.rules ?? {}));

function factoryFixtures(): string[] {
  if (!fs.existsSync(factoriesDir)) {
    return [];
  }
  return fs
    .readdirSync(factoriesDir)
    .filter((entry) => entry.endsWith('.ts'))
    .sort()
    .map((entry) => path.join(factoriesDir, entry));
}

function baselineRuleIds(text: string): string[] {
  const match = /\/\/\s*lint-baseline:\s*([a-zA-Z0-9_,-]+)/.exec(text);
  return match ? match[1].split(',') : [];
}

const files = factoryFixtures();

describe('coroutine factory fixtures', () => {
  it('has at least 12 fixtures outside the corpus', () => {
    console.log(`factory fixtures: ${files.length}`);
    expect(files.length, 'no factory fixtures').toBeGreaterThanOrEqual(12);
    for (const file of files) {
      expect(file.replaceAll('\\', '/')).not.toContain('/fixtures/corpus/');
    }
  });

  it.each(files.map((file) => [path.basename(file), file]))('%s has a valid shape', (name, file) => {
    const text = fs.readFileSync(file, 'utf8');
    expect(text, `${name} must use LF line endings`).not.toContain('\r');

    expect(() =>
      tseslintParser.parseForESLint(text, { ecmaVersion: 'latest', sourceType: 'module', filePath: file }),
    ).not.toThrow();

    const lines = text.split('\n');
    const header = /^\/\/ options: (.*)$/.exec(lines[0]);
    expect(header, `${name}: line 1 must be an options header`).not.toBeNull();
    const options: unknown = JSON.parse(header![1]);
    expect(typeof options === 'object' && options !== null && !Array.isArray(options), name).toBe(true);
    for (const key of Object.keys(options as object)) {
      expect(FACTORY_OPTION_NAMES.has(key), `${name}: unknown option ${key}`).toBe(true);
    }

    lines.forEach((lineText, index) => {
      const ruleIds = [...parseMarkerLine(lineText, index + 1).map((m) => m.ruleId), ...baselineRuleIds(lineText)];
      for (const ruleId of ruleIds) {
        expect(knownRuleIds.has(ruleId), `${name}:${index + 1}: unknown rule ${ruleId}`).toBe(true);
      }
    });
  });
});
