import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isLaneInstalled, laneDir, repoRoot } from '../integration/run-lane.js';

interface ProbeRow {
  format: 'import' | 'require';
  entry: 'main' | 'native';
  configs?: string[];
  rules?: string[];
  error?: string;
}

const LANES = [
  { name: 'lane9', minNodeMajor: 18 },
  { name: 'lane10', minNodeMajor: 22 },
];

// same switch as the lane suites, so plain `npm test` stays offline and install-free
const enabled =
  process.env.CANC_INTEGRATION === '1' ||
  process.env.npm_lifecycle_event === 'test:integration' ||
  process.env.npm_lifecycle_event === 'smoke:pack';

const nodeMajor = Number(process.versions.node.split('.')[0]);
const here = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';

function quote(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = isWindows && command === 'npm' ? 'npm.cmd' : command;
    execFile(
      isWindows && command === 'npm' ? [file, ...args.map(quote)].join(' ') : file,
      isWindows && command === 'npm' ? [] : args,
      { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true, shell: isWindows && command === 'npm' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || error.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

describe.skipIf(!enabled)('packaged plugin smoke', () => {
  const tmpRoot = path.join(os.tmpdir(), 'canc');
  let workDir = '';
  let pkgName = '';
  let tarball = '';
  const installed: string[] = [];
  const rowsByLane = new Map<string, ProbeRow[]>();

  beforeAll(async () => {
    if (!existsSync(path.join(repoRoot, 'dist/index.mjs'))) {
      throw new Error('dist is missing, run npm run build first');
    }
    mkdirSync(tmpRoot, { recursive: true });
    workDir = mkdtempSync(path.join(tmpRoot, 'pack-smoke-'));
    const packDir = path.join(workDir, 'pack');
    mkdirSync(packDir);
    pkgName = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { name: string }).name;

    const packJson = await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir], repoRoot);
    const [packed] = JSON.parse(packJson) as { filename: string }[];
    tarball = path.join(packDir, packed.filename);
    expect(existsSync(tarball)).toBe(true);

    for (const lane of LANES) {
      if (nodeMajor < lane.minNodeMajor) {
        console.log(`${lane.name}: skipped, node ${process.versions.node} is below ${lane.minNodeMajor}`);
        continue;
      }
      if (!isLaneInstalled(lane.name)) {
        throw new Error(`${lane.name} is not installed, run npm run test:integration:setup first`);
      }
      const cwd = laneDir(lane.name);
      installed.push(lane.name);
      await run('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', tarball], cwd);

      const probeDir = path.join(cwd, 'tmp-pack');
      rmSync(probeDir, { recursive: true, force: true });
      mkdirSync(probeDir);
      try {
        const rows: ProbeRow[] = [];
        for (const probe of ['probe.mjs', 'probe.cjs']) {
          cpSync(path.join(here, probe), path.join(probeDir, probe));
          const stdout = await run(
            process.execPath,
            [path.join(probeDir, probe), pkgName, path.join(probeDir, 'bad.js')],
            cwd,
          );
          rows.push(...(JSON.parse(stdout.trim().split('\n').pop() ?? '[]') as ProbeRow[]));
        }
        rowsByLane.set(lane.name, rows);
      } finally {
        rmSync(probeDir, { recursive: true, force: true });
      }
    }
  }, 600_000);

  afterAll(async () => {
    for (const lane of installed) {
      const cwd = laneDir(lane);
      try {
        await run('npm', ['uninstall', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', pkgName], cwd);
      } catch {
        // fall through to the direct removal below
      }
      rmSync(path.join(cwd, 'node_modules', ...pkgName.split('/')), { recursive: true, force: true });
    }
    if (workDir !== '') {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 600_000);

  for (const lane of LANES) {
    const skip = nodeMajor < lane.minNodeMajor;
    it.skipIf(skip)(`${lane.name} loads and lints through every format and entry`, () => {
      const rows = rowsByLane.get(lane.name) ?? [];
      for (const row of rows) {
        console.log(
          `${lane.name} ${row.format} ${row.entry}: ` +
            (row.error === undefined ?
              `configs [${(row.configs ?? []).join(', ')}] rules [${(row.rules ?? []).join(', ')}]`
            : `error ${row.error}`),
        );
      }
      expect(rows.map((row) => `${row.format}:${row.entry}`).sort()).toEqual([
        'import:main',
        'import:native',
        'require:main',
        'require:native',
      ]);
      for (const row of rows) {
        expect(row.error, `${row.format} ${row.entry} failed to load`).toBeUndefined();
        expect(row.configs, `${row.format} ${row.entry} configs`).toEqual(
          expect.arrayContaining(['recommended', 'strict', 'stylistic']),
        );
        expect(row.rules, `${row.format} ${row.entry} rule ids`).toContain('canc/no-internal-imports');
        if (row.entry === 'main') {
          expect(row.configs, `${row.format} main configs`).toEqual(
            expect.arrayContaining(['interopTypescriptEslint', 'interopPromise', 'interopUnicorn']),
          );
          expect(row.rules, `${row.format} main rule ids`).toContain('canc/no-async-executor');
        } else {
          expect(row.rules, `${row.format} native rule ids`).not.toContain('canc/no-async-executor');
        }
      }
    });
  }
});
