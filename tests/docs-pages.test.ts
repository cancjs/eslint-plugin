import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import pluginModule from '../src/index.js';

interface PluginShape {
  rules: Record<string, { meta?: { schema?: unknown } }>;
  configs: Record<string, { rules?: Record<string, unknown> }[]>;
}

const plugin = pluginModule as unknown as PluginShape;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(root, 'docs', 'rules');
const corpusDir = path.join(root, 'tests', 'fixtures', 'corpus');

// internal ids and tool names must not appear on a public page
const LEAK = new RegExp(
  [
    'EP' + '-D[0-9]',
    String.raw`R[0-9]{1,2}`,
    'TE-[0-9]',
    String.raw`E?P[0-9]+-[0-9]`,
    String.raw`\.` + 'claude',
    'phase-[0-9]',
    String.raw`(` + ['ag' + 'ent', 'Cl' + 'aude', 'L' + 'LM', 'run' + 'ner'].join('|') + String.raw`)`,
  ].join('|'),
);

const ruleIds = Object.keys(plugin.rules).sort();
const strictRules = new Set(ruleSetOf('strict'));
const stylisticRules = new Set(ruleSetOf('stylistic'));

function ruleSetOf(preset: 'strict' | 'stylistic'): string[] {
  return plugin.configs[preset]
    .flatMap((config) => Object.keys(config.rules ?? {}))
    .map((id) => id.replace(/^canc\//, ''));
}

function page(id: string): string {
  return fs.readFileSync(path.join(docsDir, `${id}.md`), 'utf8');
}

function schemaKeys(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const items = Array.isArray(schema) ? schema : [schema];
  const keys: string[] = [];
  for (const item of items) {
    const props = (item as { properties?: Record<string, unknown> } | null)?.properties;
    if (props && typeof props === 'object') keys.push(...Object.keys(props));
  }
  return keys;
}

function corpusInvalidFiles(): string[] {
  const out: string[] = [];
  for (const family of fs.readdirSync(corpusDir)) {
    const dir = path.join(corpusDir, family, 'invalid');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) out.push(path.join(dir, file));
  }
  return out;
}

function firstIncorrectBlock(text: string): string | undefined {
  const heading = /^#{1,6}\s+incorrect\b.*$/im.exec(text);
  if (!heading) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  return /```[^\n]*\n([\s\S]*?)```/.exec(rest)?.[1];
}

describe('rule doc pages', () => {
  it('audits one page per rule', () => {
    expect(ruleIds.length).toBeGreaterThan(0);
    const pages = fs
      .readdirSync(docsDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3));
    expect(pages.sort()).toEqual(ruleIds);
    console.log(`audited ${ruleIds.length} rule pages`);
  });

  it('has Incorrect and Correct headings on every page', () => {
    const missing = ruleIds.filter((id) => {
      const text = page(id);
      return !/^#{1,6}\s+incorrect\b/im.test(text) || !/^#{1,6}\s+correct\b/im.test(text);
    });
    expect(missing).toEqual([]);
  });

  it('names every schema option as a code span', () => {
    const missing: string[] = [];
    for (const id of ruleIds) {
      const text = page(id);
      for (const key of schemaKeys(plugin.rules[id].meta?.schema)) {
        if (!text.includes(`\`${key}\``)) missing.push(`${id}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a "When not to use" heading on strict and stylistic rules', () => {
    const missing = ruleIds
      .filter((id) => strictRules.has(id) || stylisticRules.has(id))
      .filter((id) => !/^#{1,6}\s+when not to use/im.test(page(id)));
    expect(missing).toEqual([]);
  });

  it('explains the open failure set on both failure-set pages', () => {
    for (const id of ['exhaustive-catch', 'no-failure-widening']) {
      expect(page(id), id).toContain('`_cancUnlisted: true`');
      expect(page(id), id).toMatch(/promise-like[^.]*open failure set/);
    }
  });

  it('contains no internal references', () => {
    const leaks = ruleIds.filter((id) => LEAK.test(page(id)));
    expect(leaks).toEqual([]);
  });

  it('links to files that exist', () => {
    const broken: string[] = [];
    for (const id of ruleIds) {
      for (const match of page(id).matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)(?:#[^)]*)?\)/g)) {
        const target = path.resolve(docsDir, match[1]);
        if (!fs.existsSync(target)) broken.push(`${id}: ${match[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has a non-empty first Incorrect block for every rule that has an invalid corpus file', () => {
    const named = new Set<string>();
    for (const file of corpusInvalidFiles()) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/\/\/ lint: ([a-z][a-z0-9-]*)/g)) {
        named.add(match[1]);
      }
    }
    const empty = ruleIds.filter((id) => named.has(id)).filter((id) => !(firstIncorrectBlock(page(id)) ?? '').trim());
    expect(named.size).toBeGreaterThan(0);
    expect(empty).toEqual([]);
  });
});
