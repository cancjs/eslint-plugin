import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_ROOT_FILES = new Set(['package.json', 'README.md', 'LICENSE']);
const REQUIRED = [
  'dist/index.cjs',
  'dist/index.mjs',
  'dist/index.d.cts',
  'dist/index.d.mts',
  'dist/native.cjs',
  'dist/native.mjs',
  'LICENSE',
];
const FORBIDDEN = [
  /^tests\//,
  /^src\//,
  /^scripts\//,
  new RegExp('^\\.' + 'cla' + 'ude'),
  /(^|\/)CLAUDE\.md$/,
  /\.test\./,
];

interface PackageJson {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports: Record<string, Record<string, { types: string; default: string }>>;
}

function collectExportTargets(pkg: PackageJson): string[] {
  const targets: string[] = [];
  for (const entry of Object.values(pkg.exports)) {
    for (const condition of Object.values(entry)) {
      targets.push(condition.types, condition.default);
    }
  }
  return targets.map((target) => target.replace(/^\.\//, ''));
}

describe('packed file list', () => {
  let files: string[] = [];

  beforeAll(() => {
    if (!fs.existsSync(path.join(root, 'dist', 'index.cjs'))) {
      throw new Error('dist is missing: run `npm run build` before this test');
    }
    const out = execSync('npm pack --dry-run --json', {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(out) as { files: { path: string }[] }[];
    files = parsed[0].files.map((file) => file.path);
  });

  it('holds only built output, docs and the root files', () => {
    const offenders = files.filter(
      (file) => !(file.startsWith('dist/') || file.startsWith('docs/') || ALLOWED_ROOT_FILES.has(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('holds every built entry file and the license', () => {
    for (const required of REQUIRED) {
      expect(files, required).toContain(required);
    }
  });

  it('holds no source, test or internal file', () => {
    const offenders = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)));
    expect(offenders).toEqual([]);
  });

  it('holds no source map', () => {
    expect(files.filter((file) => file.endsWith('.map'))).toEqual([]);
  });

  it('holds every export target', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as PackageJson;
    for (const target of collectExportTargets(pkg)) {
      expect(files, target).toContain(target);
    }
  });
});

describe('peer dependencies', () => {
  it('requires typescript', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as PackageJson;
    expect(pkg.peerDependencies).toHaveProperty('typescript');
    expect(pkg.peerDependenciesMeta?.typescript?.optional).not.toBe(true);
  });
});
