// Packs the repository itself and installs the tarball into the ESLint 9 lane.
// scripts in tests/integration/lane9/tmp-pack so any Node version can run them without vitest.
// Usage: node scripts/pack-install.mjs (run npm run build and npm run test:integration:setup first)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lane = path.join(root, 'tests', 'integration', 'lane9');
const probeDir = path.join(lane, 'tmp-pack');
const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg);

if (!existsSync(path.join(root, 'dist', 'index.mjs'))) {
  throw new Error('dist is missing, run npm run build first');
}
if (!existsSync(path.join(lane, 'node_modules'))) {
  throw new Error('lane9 is not installed, run npm run test:integration:setup first');
}

const npm = (args, cwd) =>
  execSync(['npm', ...args.map(quote)].join(' '), {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });

const tmpRoot = path.join(os.tmpdir(), 'canc');
mkdirSync(tmpRoot, { recursive: true });
const work = mkdtempSync(path.join(tmpRoot, 'pack-install-'));
try {
  const packDir = path.join(work, 'pack');
  mkdirSync(packDir);
  const name = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name;

  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', packDir], root));
  const tarball = path.join(packDir, packed.filename);
  npm(['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', tarball], lane);

  rmSync(probeDir, { recursive: true, force: true });
  mkdirSync(probeDir);
  for (const probe of ['probe.cjs', 'probe.mjs']) {
    cpSync(path.join(root, 'tests', 'pack-smoke', probe), path.join(probeDir, probe));
  }
  console.log(`installed ${name} into lane9; probes in tests/integration/lane9/tmp-pack`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
