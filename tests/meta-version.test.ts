import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import plugin from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

describe('plugin meta version', () => {
  it('equals the package version', () => {
    expect(plugin.meta?.version).toBe(pkg.version);
  });

  it('is the first release version', () => {
    expect(pkg.version).toBe('0.1.0');
  });
});
