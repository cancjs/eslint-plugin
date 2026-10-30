import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { readMarkers } from '../helpers/corpus.js';
import {
  corpusSources,
  fixturesDir,
  integrationDir,
  isLaneInstalled,
  type LaneFileResult,
  type LaneMessage,
  repoRoot,
  runLane,
} from './run-lane.js';

interface ManifestEntry {
  file: string;
  ruleId: string;
  line: number;
  reason: string;
}

interface Lane {
  name: string;
  minNodeMajor: number;
}

const LANES: Lane[] = [
  { name: 'lane9', minNodeMajor: 18 },
  { name: 'lane10', minNodeMajor: 22 },
];

// foreign rules whose autofix or advice fights the executor idiom, checked by name on top of (a)
const EXECUTOR_IDIOM_GUARDED_RULES = [
  'promise/catch-or-return',
  'promise/prefer-await-to-then',
  '@typescript-eslint/promise-function-async',
];

// npm sets the lifecycle event, so plain `npm test` stays offline and install-free
const enabled = process.env.npm_lifecycle_event === 'test:integration' || process.env.CANC_INTEGRATION === '1';

const nodeMajor = Number(process.versions.node.split('.')[0]);
const distDir = path.join(repoRoot, 'dist');
const srcDir = path.join(repoRoot, 'src');

const manifest = JSON.parse(readFileSync(path.join(integrationDir, 'expected.json'), 'utf8')) as ManifestEntry[];

const require = createRequire(import.meta.url);
const builtPlugin = require(path.join(distDir, 'index.cjs')) as { configs: Record<string, Linter.Config[]> };

const enabledCancRules = new Set(
  builtPlugin.configs.recommended.flatMap((config) =>
    Object.entries(config.rules ?? {})
      .filter(([, setting]) => setting !== 'off' && !(Array.isArray(setting) && setting[0] === 'off'))
      .map(([id]) => id.replace(/^canc\//, '')),
  ),
);

function newestMtimeMs(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    newest = Math.max(newest, stat.isDirectory() ? newestMtimeMs(full) : stat.mtimeMs);
  }
  return newest;
}

// a directive naming only rules this preset does not run is expected, the corpus serves every tier
function isIdleDirective(message: LaneMessage): boolean {
  const unused = /^Unused eslint-disable directive \(no problems were reported from ([^)]+)\)\.$/.exec(message.message);
  if (message.ruleId !== null || unused === null) {
    return false;
  }
  const named = [...unused[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return named.every((id) => id.startsWith('canc/') && !enabledCancRules.has(id.slice('canc/'.length)));
}

function format(file: string, messages: LaneMessage[]): string {
  return messages.map((m) => `${file}:${m.line}:${m.column} ${m.ruleId ?? 'core'} ${m.message}`).join('\n');
}

function keyOf(ruleId: string, line: number): string {
  return `${ruleId}@${line}`;
}

function manifestKeys(file: string): Set<string> {
  return new Set(manifest.filter((entry) => entry.file === file).map((entry) => keyOf(entry.ruleId, entry.line)));
}

// a manifest entry that no longer fires is stale and must go
function staleManifestEntries(result: LaneFileResult): string[] {
  return manifest
    .filter((entry) => entry.file === result.file)
    .filter((entry) => !result.messages.some((m) => m.ruleId === entry.ruleId && m.line === entry.line))
    .map((entry) => `${result.file}: stale manifest entry ${keyOf(entry.ruleId, entry.line)}`);
}

// same mapping as the corpus rule tests: a marker names the defect line, the report may sit on the
// line next to it (the owning catch, or the start of the second operation), so the closest report
// of the marked rule within one line wins
function nearestReport(reports: Set<LaneMessage>, ruleId: string, line: number): LaneMessage | undefined {
  let best: LaneMessage | undefined;
  for (const report of reports) {
    const distance = Math.abs(report.line - line);
    if (report.ruleId === ruleId && distance <= 1 && (best === undefined || distance < Math.abs(best.line - line))) {
      best = report;
    }
  }
  return best;
}

for (const lane of LANES) {
  const skipForNode = nodeMajor < lane.minNodeMajor;

  describe.skipIf(!enabled)(`integration ${lane.name}`, () => {
    let results: LaneFileResult[] = [];
    if (skipForNode) {
      // hooks do not run for a fully skipped suite, so report the skip at collection
      console.log(`${lane.name}: skipped, node ${process.versions.node} is below ${lane.minNodeMajor}`);
    }

    beforeAll(async () => {
      if (skipForNode) {
        return;
      }
      if (!isLaneInstalled(lane.name)) {
        throw new Error(`${lane.name} is not installed, run npm run test:integration:setup first`);
      }
      if (!existsSync(path.join(distDir, 'index.mjs'))) {
        throw new Error('dist is missing, run npm run build first');
      }
      if (statSync(path.join(distDir, 'index.mjs')).mtimeMs < newestMtimeMs(srcDir)) {
        throw new Error('dist is older than src, run npm run build first');
      }
      results = await runLane({ lane: lane.name, sources: corpusSources, targets: ['corpus'] });
      const valid = results.filter((r) => r.file.includes('/valid/'));
      const invalid = results.filter((r) => r.file.includes('/invalid/'));
      const manifestHits = manifest.filter((entry) =>
        results.some(
          (r) => r.file === entry.file && r.messages.some((m) => m.ruleId === entry.ruleId && m.line === entry.line),
        ),
      ).length;
      console.log(
        `${lane.name}: valid files checked ${valid.length}, invalid files checked ${invalid.length}, ` +
          `diagnostics outside markers (manifest hits) ${manifestHits}`,
      );
    }, 600_000);

    it.skipIf(skipForNode)('lints the whole corpus', () => {
      expect(results.length).toBe(countCorpusFiles());
    });

    it.skipIf(skipForNode)('reports nothing on any valid corpus file outside the manifest', () => {
      const problems: string[] = [];
      for (const result of results.filter((r) => r.file.includes('/valid/'))) {
        const allowed = manifestKeys(result.file);
        const unexpected = result.messages.filter(
          (m) => !isIdleDirective(m) && !allowed.has(keyOf(m.ruleId ?? 'core', m.line)),
        );
        const text = format(result.file, unexpected);
        if (text !== '') {
          problems.push(text);
        }
        problems.push(...staleManifestEntries(result));
      }
      expect(problems.join('\n'), 'expected zero diagnostics on valid corpus files').toBe('');
    });

    it.skipIf(skipForNode)('reports exactly the markers plus manifest entries on invalid corpus files', () => {
      const mismatches: string[] = [];
      for (const result of results.filter((r) => r.file.includes('/invalid/'))) {
        const markers = readMarkers(path.join(fixturesDir, result.file)).filter((marker) =>
          enabledCancRules.has(marker.ruleId),
        );
        const allowed = manifestKeys(result.file);
        const reports = result.messages.filter((m) => !isIdleDirective(m));
        const unmatched = new Set(reports.filter((m) => m.ruleId?.startsWith('canc/')));
        const missing: string[] = [];
        for (const marker of markers) {
          const hit = nearestReport(unmatched, `canc/${marker.ruleId}`, marker.line);
          if (hit === undefined) {
            missing.push(keyOf(`canc/${marker.ruleId}`, marker.line));
          } else {
            // one marker covers every report of its rule on the reported line
            for (const report of [...unmatched]) {
              if (report.ruleId === hit.ruleId && report.line === hit.line) {
                unmatched.delete(report);
              }
            }
          }
        }
        const extra = [
          ...[...unmatched].map((m) => keyOf(m.ruleId ?? 'core', m.line)),
          ...reports
            .filter((m) => !m.ruleId?.startsWith('canc/') && !allowed.has(keyOf(m.ruleId ?? 'core', m.line)))
            .map((m) => keyOf(m.ruleId ?? 'core', m.line)),
        ];
        missing.push(...staleManifestEntries(result));
        if (missing.length > 0 || extra.length > 0) {
          mismatches.push(`${result.file}: missing [${missing.join(', ')}] extra [${extra.join(', ')}]`);
        }
      }
      expect(mismatches.join('\n'), 'invalid corpus diagnostics differ from markers and manifest').toBe('');
    });

    it.skipIf(skipForNode)('keeps promise-style rules silent on executor idioms', () => {
      const detail = results
        .filter((r) => r.file.startsWith('corpus/executor/valid/'))
        .map((r) =>
          format(
            r.file,
            r.messages.filter((m) => m.ruleId !== null && EXECUTOR_IDIOM_GUARDED_RULES.includes(m.ruleId)),
          ),
        )
        .filter((text) => text !== '')
        .join('\n');
      expect(detail, 'expected no promise-style diagnostics on executor idioms').toBe('');
    });
  });
}

function countCorpusFiles(): number {
  function walk(dir: string): number {
    return readdirSync(dir).reduce((count, entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        return count + walk(full);
      }
      return count + (entry.endsWith('.ts') ? 1 : 0);
    }, 0);
  }
  return walk(path.join(fixturesDir, 'corpus'));
}
