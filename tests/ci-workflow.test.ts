import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, '.github', 'workflows', 'ci.yml');

function readWorkflow(): string {
  if (!fs.existsSync(workflowPath)) {
    throw new Error('ci.yml not found');
  }
  return fs.readFileSync(workflowPath, 'utf8');
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  engines: { node: string };
  devEngines?: { runtime?: { name?: string; version?: string; onFail?: string } };
};

function runLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => /^\s*-\s+run:\s*(.+?)\s*$/.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
}

interface Job {
  name: string;
  lines: string[];
}

function splitJobs(text: string): Job[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === 'jobs:');
  const jobs: Job[] = [];
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([\w-]+):\s*$/.exec(line);
    if (header) {
      jobs.push({ name: header[1], lines: [] });
    } else {
      jobs.at(-1)?.lines.push(line);
    }
  }
  return jobs;
}

function major(version: string): number {
  return Number(/\d+/.exec(version)?.[0]);
}

function matrixVersions(job: Job): string[] {
  const row = job.lines.find((line) => /^\s+node-version: \[/.test(line));
  return row ? [...row.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

describe('ci workflow', () => {
  it('runs only install and package scripts that exist', () => {
    const bad = runLines(readWorkflow()).filter((command) => {
      if (command === 'npm ci' || command === 'npm test') return false;
      if (/^node tests\/integration\/lane9\/tmp-pack\/probe\.(cjs|mjs) \S+ \S+$/.test(command)) return false;
      const script = /^npm run (\S+)$/.exec(command)?.[1];
      return script === undefined || !(script in pkg.scripts);
    });
    expect(bad).toEqual([]);
  });

  it('calls the integration and pack smoke scripts as their own steps', () => {
    const commands = runLines(readWorkflow());
    expect(commands).toContain('npm run test:integration');
    expect(commands).toContain('npm run smoke:pack');
  });

  it('local script prints the workflow commands in order', () => {
    const expected: string[] = [];
    for (const command of runLines(readWorkflow())) {
      if (command === 'npm ci' && expected.includes(command)) continue;
      expected.push(command);
    }
    const result = spawnSync(process.execPath, ['scripts/ci-local.mjs', '--print'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(expected);
  });

  it('has no publish step, secret or token', () => {
    expect(readWorkflow()).not.toMatch(/publish|npm_token|NODE_AUTH_TOKEN|id-token|secrets\.|continue-on-error/i);
  });

  it('builds and checks docs only on node 22 or newer', () => {
    const low: string[] = [];
    for (const job of splitJobs(readWorkflow())) {
      let versions: string[] = [];
      for (const line of job.lines) {
        const set = /^\s+node-version: (.+?)\s*$/.exec(line);
        if (set) {
          const raw = set[1].replaceAll("'", '');
          versions = raw.startsWith('${{') ? matrixVersions(job) : [raw];
          continue;
        }
        const command = /^\s*-\s+run:\s*(.+?)\s*$/.exec(line)?.[1];
        if (command && /\b(build|docs:check)\b/.test(command) && versions.some((v) => major(v) < 22)) {
          low.push(`${job.name}: ${command}`);
        }
      }
    }
    expect(low).toEqual([]);
  });

  it('proves the engines floor on a node 18 job after building on 22', () => {
    expect(pkg.engines.node).toBe('>=18.18');
    expect(pkg.devEngines?.runtime).toEqual({ name: 'node', version: '>=22.18.0', onFail: 'warn' });
    const job = splitJobs(readWorkflow()).find((j) => j.name === 'dist-node18');
    expect(job).toBeDefined();
    const text = job!.lines.join('\n');
    expect(text).toContain("node-version: '18.x'");
    expect(text.indexOf("node-version: '22.x'")).toBeGreaterThan(-1);
    expect(text.indexOf("node-version: '22.x'")).toBeLessThan(text.indexOf("node-version: '18.x'"));
    const afterNode18 = runLines(text.slice(text.indexOf("node-version: '18.x'")));
    expect(afterNode18).toHaveLength(2);
    expect(afterNode18[0]).toMatch(/^node tests\/integration\/lane9\/tmp-pack\/probe\.cjs /);
    expect(afterNode18[1]).toMatch(/^node tests\/integration\/lane9\/tmp-pack\/probe\.mjs /);
    expect(runLines(text.slice(0, text.indexOf("node-version: '18.x'")))).toContain('npm run pack:install');
  });

  it('builds before every job step that runs npm test', () => {
    const missing: string[] = [];
    for (const job of splitJobs(readWorkflow())) {
      const commands = runLines(job.lines.join('\n'));
      const test = commands.indexOf('npm test');
      if (test !== -1 && !commands.slice(0, test).includes('npm run build')) {
        missing.push(job.name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('runs no vitest command on node 18', () => {
    const job = splitJobs(readWorkflow()).find((j) => j.name === 'dist-node18');
    const text = job!.lines.join('\n');
    const onNode18 = runLines(text.slice(text.indexOf("node-version: '18.x'")));
    const bad = onNode18.filter((command) => /vitest|npm test|npm run smoke:pack|npm run test/.test(command));
    expect(bad).toEqual([]);
  });
});
