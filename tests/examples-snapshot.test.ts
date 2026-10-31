import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const snapshotDir = path.join(fixturesDir, 'examples-snapshot');
const projectDir = path.join(fixturesDir, 'projects/examples');
const tsconfigPath = path.join(projectDir, 'tsconfig.json');
const findingsPath = path.join(snapshotDir, 'FINDINGS.md');

const CLASSES = ['TP', 'FP', 'policy'];

interface Finding {
  /** `<file>:<line>|<rule>|<messageId>` */
  key: string;
  tier: 'recommended' | 'strict';
  count: number;
}

interface Row {
  key: string;
  tier: string;
  count: number;
  cls: string;
  note: string;
}

function toPosix(p: string): string {
  return p.replaceAll('\\', '/');
}

function demoFiles(): string[] {
  const out: string[] = [];
  for (const demo of readdirSync(snapshotDir, { withFileTypes: true })) {
    if (!demo.isDirectory() || !demo.name.startsWith('demo-')) continue;
    const src = path.join(snapshotDir, demo.name, 'src');
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        out.push(`${demo.name}/src/${entry.name}`);
      }
    }
  }
  return out.sort();
}

function createProgram(): ts.Program {
  const config = ts.readConfigFile(tsconfigPath, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, projectDir, undefined, tsconfigPath);
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

/** Files whose own imports, or the imports of a file they pull in, do not resolve. */
function unresolvedFiles(program: ts.Program): Map<string, string[]> {
  const options = program.getCompilerOptions();
  const checker = program.getTypeChecker();
  const own = new Map<string, Set<string>>();
  const edges = new Map<string, string[]>();
  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.includes('/node_modules/')) continue;
    const missing = new Set<string>();
    const deps: string[] = [];
    // imports is populated by the program but absent from the public typings
    for (const imp of (sf as ts.SourceFile & { imports: ts.StringLiteralLike[] }).imports) {
      if (!checker.getSymbolAtLocation(imp)) {
        missing.add(imp.text);
        continue;
      }
      const resolved = ts.resolveModuleName(imp.text, sf.fileName, options, ts.sys).resolvedModule;
      if (resolved && !resolved.resolvedFileName.includes('/node_modules/')) {
        deps.push(resolved.resolvedFileName);
      }
    }
    own.set(sf.fileName, missing);
    edges.set(sf.fileName, deps);
  }
  const result = new Map<string, string[]>();
  for (const file of own.keys()) {
    const seen = new Set<string>();
    const missing = new Set<string>();
    const stack = [file];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const m of own.get(current) ?? []) missing.add(m);
      stack.push(...(edges.get(current) ?? []));
    }
    if (missing.size > 0) {
      result.set(toPosix(path.relative(snapshotDir, file)), [...missing].sort());
    }
  }
  return result;
}

async function lint(preset: 'recommended' | 'strict', files: string[]): Promise<Map<string, number>> {
  const presetConfigs = (plugin.configs as Record<string, Linter.Config[]>)[preset];
  const eslint = new ESLint({
    cwd: fixturesDir,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslintParser,
          parserOptions: {
            project: [tsconfigPath],
            tsconfigRootDir: projectDir,
            // single-run inference would drop the project program on the second parse
            disallowAutomaticSingleRunInference: true,
          },
        },
      },
      ...presetConfigs,
    ],
  });
  const results = await eslint.lintFiles(files.map((f) => path.join(snapshotDir, f)));
  const counts = new Map<string, number>();
  for (const result of results) {
    const rel = toPosix(path.relative(snapshotDir, result.filePath));
    for (const m of result.messages) {
      if (m.fatal) throw new Error(`${rel}:${m.line} parse failure: ${m.message}`);
      const key = `${rel}:${m.line}|${m.ruleId ?? 'none'}|${m.messageId ?? 'none'}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function parseFindings(text: string): { rows: Row[]; outOfScope: Map<string, string> } {
  const rows: Row[] = [];
  const outOfScope = new Map<string, string>();
  for (const line of text.split('\n')) {
    const row = /^\| (\S+:\d+) \| (\S+) \| (\S+) \| (recommended|strict) \| x(\d+) \| (\S+) \| (.*) \|$/.exec(line);
    if (row) {
      rows.push({
        key: `${row[1]}|${row[2]}|${row[3]}`,
        tier: row[4],
        count: Number(row[5]),
        cls: row[6],
        note: row[7],
      });
    }
    const oos = /^- (\S+): out of scope: unresolved imports \((.*)\)$/.exec(line);
    if (oos) outOfScope.set(oos[1], oos[2]);
  }
  return { rows, outOfScope };
}

describe('examples snapshot triage', () => {
  it('has a triaged findings row for every diagnostic and the reverse', async () => {
    const all = demoFiles();
    const unresolved = unresolvedFiles(createProgram());
    const outOfScope = all.filter((f) => unresolved.has(f));
    const inScope = all.filter((f) => !unresolved.has(f));

    const recommended = await lint('recommended', inScope);
    const strict = await lint('strict', inScope);
    const findings: Finding[] = [...strict.entries()].map(([key, count]) => ({
      key,
      count,
      tier: recommended.has(key) ? 'recommended' : 'strict',
    }));

    const parsed = parseFindings(readFileSync(findingsPath, 'utf8'));
    const rowsByKey = new Map(parsed.rows.map((r) => [r.key, r]));
    const findingsByKey = new Map(findings.map((f) => [f.key, f]));

    const untriaged = findings.filter((f) => !rowsByKey.has(f.key));
    const stale = parsed.rows.filter((r) => !findingsByKey.has(r.key));
    const mismatched = findings.filter((f) => {
      const row = rowsByKey.get(f.key);
      return row !== undefined && (row.count !== f.count || row.tier !== f.tier);
    });
    const badClass = parsed.rows.filter((r) => !CLASSES.includes(r.cls));
    const fpWithoutFix = parsed.rows.filter((r) => r.cls === 'FP' && !/\bFIX-\d+\b/.test(r.note));

    const classCount = (cls: string) => parsed.rows.filter((r) => r.cls === cls).reduce((n, r) => n + r.count, 0);
    const diagnostics = findings.reduce((n, f) => n + f.count, 0);
    console.log(
      `examples snapshot: ${all.length} files, ${inScope.length} linted, ${outOfScope.length} out of scope, ` +
        `${diagnostics} diagnostics (${findings.length} rows), TP ${classCount('TP')}, FP ${classCount('FP')}, ` +
        `policy ${classCount('policy')}`,
    );

    const detail = (label: string, list: string[]) => (list.length > 0 ? `${label}:\n  ${list.join('\n  ')}\n` : '');
    const problems =
      detail(
        'diagnostic without a findings row',
        untriaged.map((f) => `${f.key} x${f.count} (${f.tier})`),
      ) +
      detail(
        'findings row without a diagnostic',
        stale.map((r) => r.key),
      ) +
      detail(
        'row count or tier differs from the lint output',
        mismatched.map((f) => `${f.key} x${f.count} (${f.tier})`),
      ) +
      detail(
        'row with an unknown class',
        badClass.map((r) => r.key),
      ) +
      detail(
        'false positive row without a fix id',
        fpWithoutFix.map((r) => r.key),
      );
    expect(problems).toBe('');

    expect(parsed.outOfScope.size).toBe(outOfScope.length);
    for (const file of outOfScope) {
      expect(parsed.outOfScope.get(file), `out of scope entry for ${file}`).toBe(
        (unresolved.get(file) ?? []).join(', '),
      );
    }
  }, 120_000);
});
