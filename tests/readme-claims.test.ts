import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import nativePlugin from '../src/native.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

function nativeRuleIds(): string[] {
  const configs = nativePlugin.configs as Record<string, { rules?: Record<string, unknown> }[]>;
  const ids = new Set<string>();
  for (const config of Object.values(configs)) {
    for (const entry of config) {
      for (const id of Object.keys(entry.rules ?? {})) ids.add(id.replace(/^canc\//, ''));
    }
  }
  return [...ids].sort();
}

describe('readme claims', () => {
  it('does not call typescript optional', () => {
    expect(readme).not.toMatch(/Both are optional/);
    expect(readme).toMatch(/needs `typescript`/);
  });

  it('says a cancelable type must be named and declared in a source', () => {
    expect(readme).toMatch(/named in `cancelableTypeNames` and declared in one of `sources`/);
  });

  it('names the typed rule that still reports without type information', () => {
    expect(readme).toMatch(/`prefer-canc-throw`[^.]*without type information/);
  });

  it('links every rule of the native entry and says it has no interop configs', () => {
    const ids = nativeRuleIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(readme, id).toContain(`(docs/rules/${id}.md)`);
    expect(readme).toMatch(/no interop configs/);
  });
});
