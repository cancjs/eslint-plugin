import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const integrationDir = __dirname;
export const repoRoot = path.resolve(__dirname, '../..');
export const fixturesDir = path.join(repoRoot, 'tests/fixtures');

export interface LaneMessage {
  ruleId: string | null;
  line: number;
  column: number;
  message: string;
  severity: number;
}

export interface LaneFileResult {
  /** Path relative to the lane `tmp/` dir, forward slashes. */
  file: string;
  messages: LaneMessage[];
}

export interface LaneSource {
  /** Absolute source path, file or directory. */
  from: string;
  /** Destination relative to the lane `tmp/` dir. */
  to: string;
}

export interface LaneRunOptions {
  lane: string;
  sources: LaneSource[];
  /** Lint targets relative to the lane `tmp/` dir. */
  targets: string[];
}

interface EslintJsonResult {
  filePath: string;
  messages: LaneMessage[];
}

export function laneDir(lane: string): string {
  return path.join(integrationDir, lane);
}

export function laneEslintBin(lane: string): string {
  return path.join(laneDir(lane), 'node_modules/eslint/bin/eslint.js');
}

export function isLaneInstalled(lane: string): boolean {
  return existsSync(laneEslintBin(lane));
}

function runEslint(cwd: string, bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [bin, ...args],
      { cwd, maxBuffer: 256 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        // exit code 1 = lint problems found, the JSON on stdout is still complete
        if (error && error.code !== 1) {
          reject(new Error(`eslint failed (${String(error.code)}): ${stderr || error.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/**
 * Copies the sources into `<lane>/tmp/`, runs the lane's own ESLint over the targets with the JSON
 * formatter, and removes `tmp/` again whatever the outcome.
 */
export async function runLane(options: LaneRunOptions): Promise<LaneFileResult[]> {
  const cwd = laneDir(options.lane);
  const tmpDir = path.join(cwd, 'tmp');
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  try {
    for (const source of options.sources) {
      cpSync(source.from, path.join(tmpDir, source.to), { recursive: true });
    }
    const targets = options.targets.map((target) => path.join('tmp', target));
    const stdout = await runEslint(cwd, laneEslintBin(options.lane), ['--format', 'json', ...targets]);
    const parsed = JSON.parse(stdout) as EslintJsonResult[];
    return parsed
      .map((result) => ({
        file: path.relative(tmpDir, result.filePath).replaceAll('\\', '/'),
        messages: result.messages,
      }))
      .sort((a, b) => a.file.localeCompare(b.file));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Corpus plus the stub packages, laid out so the corpus tsconfig `paths` still resolve. */
export const corpusSources: LaneSource[] = [
  { from: path.join(fixturesDir, 'corpus'), to: 'corpus' },
  {
    from: path.join(fixturesDir, 'projects/default/node_modules/@cancjs'),
    to: 'projects/default/node_modules/@cancjs',
  },
];
