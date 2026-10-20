import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const targetBaseDir = join(repoRoot, 'tests', 'fixtures', 'projects', 'default', 'node_modules', '@cancjs');

const PACKAGES = [
  { name: '@cancjs/promise', dir: 'promise', monoPkg: 'canc-promise' },
  { name: '@cancjs/coroutine', dir: 'coroutine', monoPkg: 'canc-coroutine' },
  { name: '@cancjs/toolbox', dir: 'toolbox', monoPkg: 'canc-toolbox' },
  { name: '@cancjs/toolbox-native', dir: 'toolbox-native', monoPkg: 'canc-toolbox-native' },
];

function parseMonoPath() {
  let monoArg = null;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--mono') {
      monoArg = process.argv[++i];
    } else if (arg.startsWith('--mono=')) {
      monoArg = arg.slice('--mono='.length);
    }
  }

  if (!monoArg) {
    console.error('Usage: node scripts/gen-fixture-stubs.mjs --mono <path-to-mono-repo>');
    process.exit(1);
  }

  return resolve(process.cwd(), monoArg);
}

function checkFreshness(monoRoot) {
  const promiseTypesPath = join(monoRoot, 'packages', 'canc-promise', 'dist', 'types', 'cancelable-promise.d.ts');
  if (!existsSync(promiseTypesPath)) {
    console.error(`Freshness gate failed: file not found: ${promiseTypesPath}`);
    process.exit(1);
  }

  const content = readFileSync(promiseTypesPath, 'utf8');
  if (!content.includes('TFailure = unknown')) {
    console.error('Freshness gate failed: "TFailure = unknown" not found in promise types');
    process.exit(1);
  }
}

function getMonoCommitSubject(monoRoot) {
  try {
    return execFileSync('git', ['-C', monoRoot, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`Failed to get mono commit subject: ${err.message}`);
    process.exit(1);
  }
}

function collectDtsFiles(dir, baseDir = dir) {
  const results = [];
  if (!existsSync(dir)) {
    return results;
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.includes('types-ts4.2')) {
        results.push(...collectDtsFiles(fullPath, baseDir));
      }
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.d.ts') && !entry.name.endsWith('.d.mts')) {
        results.push(relative(baseDir, fullPath));
      }
    }
  }

  return results.sort();
}

function buildExports(monoExports) {
  const exportsMap = {};
  if (monoExports && typeof monoExports === 'object') {
    for (const subpath of Object.keys(monoExports)) {
      if (subpath === '.') {
        exportsMap['.'] = { types: './index.d.ts' };
      } else {
        exportsMap[subpath] = { types: `${subpath}.d.ts` };
      }
    }
  } else {
    exportsMap['.'] = { types: './index.d.ts' };
  }
  return exportsMap;
}

function main() {
  const monoRoot = parseMonoPath();
  checkFreshness(monoRoot);

  const monoCommitSubject = getMonoCommitSubject(monoRoot);
  const packageVersions = {};

  // Clean dead stubs if present
  rmSync(join(targetBaseDir, 'lazy-promise'), { recursive: true, force: true });
  rmSync(join(targetBaseDir, 'coroutine', 'iter'), { recursive: true, force: true });

  for (const pkg of PACKAGES) {
    const monoPkgDir = join(monoRoot, 'packages', pkg.monoPkg);
    const monoPkgJsonPath = join(monoPkgDir, 'package.json');
    if (!existsSync(monoPkgJsonPath)) {
      console.error(`Package manifest not found: ${monoPkgJsonPath}`);
      process.exit(1);
    }

    const monoPkgJson = JSON.parse(readFileSync(monoPkgJsonPath, 'utf8'));
    packageVersions[pkg.name] = monoPkgJson.version;

    const pkgTargetDir = join(targetBaseDir, pkg.dir);
    rmSync(pkgTargetDir, { recursive: true, force: true });
    mkdirSync(pkgTargetDir, { recursive: true });

    const srcTypesDir = join(monoPkgDir, 'dist', 'types');
    const dtsFiles = collectDtsFiles(srcTypesDir);

    for (const relFile of dtsFiles) {
      const srcPath = join(srcTypesDir, relFile);
      const destPath = join(pkgTargetDir, relFile);
      const content = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, content, 'utf8');
    }

    const stubPkgJson = {
      name: monoPkgJson.name,
      version: monoPkgJson.version,
      types: './index.d.ts',
      exports: buildExports(monoPkgJson.exports),
    };

    writeFileSync(join(pkgTargetDir, 'package.json'), JSON.stringify(stubPkgJson, null, 2) + '\n', 'utf8');
  }

  const stubsMeta = {
    monoCommitSubject,
    packages: packageVersions,
  };

  writeFileSync(join(targetBaseDir, 'STUBS.json'), JSON.stringify(stubsMeta, null, 2) + '\n', 'utf8');
}

main();
