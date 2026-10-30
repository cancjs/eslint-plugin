import fs from 'node:fs';
import path from 'node:path';

import tseslintParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

import { CATALOG_RULE_IDS, corpusFiles, parseMarkerLine, readMarkers } from './helpers/corpus.js';

describe('corpus shape: 261 fixtures across 7 families', () => {
  const families = ['coroutine', 'error-handling', 'executor', 'flow', 'hygiene', 'lazy', 'failure'] as const;

  it('prints per-family counts summing to 261 files', () => {
    const allFiles = corpusFiles();
    expect(allFiles).toHaveLength(261);

    const counts: Record<string, { total: number; valid: number; invalid: number }> = {};
    for (const fam of families) {
      const valid = corpusFiles(fam, 'valid').length;
      const invalid = corpusFiles(fam, 'invalid').length;
      counts[fam] = { total: valid + invalid, valid, invalid };
    }

    const summary = families
      .map((fam) => `${fam}: ${counts[fam].total} (${counts[fam].valid} valid, ${counts[fam].invalid} invalid)`)
      .join(', ');
    console.log(`Corpus shape: 261 files [${summary}]`);

    expect(counts.coroutine.total).toBe(37);
    expect(counts.coroutine.valid).toBe(21);
    expect(counts.coroutine.invalid).toBe(16);

    expect(counts['error-handling'].total).toBe(39);
    expect(counts['error-handling'].valid).toBe(22);
    expect(counts['error-handling'].invalid).toBe(17);

    expect(counts.executor.total).toBe(60);
    expect(counts.executor.valid).toBe(38);
    expect(counts.executor.invalid).toBe(22);

    expect(counts.flow.total).toBe(40);
    expect(counts.flow.valid).toBe(30);
    expect(counts.flow.invalid).toBe(10);

    expect(counts.hygiene.total).toBe(27);
    expect(counts.hygiene.valid).toBe(16);
    expect(counts.hygiene.invalid).toBe(11);

    expect(counts.lazy.total).toBe(15);
    expect(counts.lazy.valid).toBe(8);
    expect(counts.lazy.invalid).toBe(7);

    expect(counts.failure.total).toBe(43);
    expect(counts.failure.valid).toBe(26);
    expect(counts.failure.invalid).toBe(17);

    const sum = Object.values(counts).reduce((acc, c) => acc + c.total, 0);
    expect(sum).toBe(261);
  });

  it('every invalid file has at least 1 marker', () => {
    const invalidFiles = corpusFiles(undefined, 'invalid');
    expect(invalidFiles.length).toBe(100);

    const missingMarkers: string[] = [];
    for (const file of invalidFiles) {
      const markers = readMarkers(file);
      if (markers.length === 0) {
        missingMarkers.push(path.basename(file));
      }
    }
    expect(missingMarkers).toEqual([]);
  });

  it('every marker id is in CATALOG_RULE_IDS', () => {
    const invalidFiles = corpusFiles(undefined, 'invalid');
    const catalogSet = new Set<string>(CATALOG_RULE_IDS);
    const unknownMarkers: { file: string; ruleId: string }[] = [];

    for (const file of invalidFiles) {
      const markers = readMarkers(file);
      for (const m of markers) {
        if (!catalogSet.has(m.ruleId)) {
          unknownMarkers.push({ file: path.basename(file), ruleId: m.ruleId });
        }
      }
    }
    expect(unknownMarkers).toEqual([]);
  });

  it('valid files carry no marker', () => {
    const validFiles = corpusFiles(undefined, 'valid');
    expect(validFiles.length).toBe(161);

    const spuriousMarkers: { file: string; line: number; ruleId: string }[] = [];
    for (const file of validFiles) {
      const markers = readMarkers(file);
      for (const m of markers) {
        spuriousMarkers.push({ file: path.basename(file), line: m.line, ruleId: m.ruleId });
      }
    }
    expect(spuriousMarkers).toEqual([]);
  });

  it('every file parses with @typescript-eslint/parser', () => {
    const allFiles = corpusFiles();
    const parseErrors: { file: string; error: string }[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      try {
        tseslintParser.parse(content, {
          ecmaVersion: 'latest',
          sourceType: 'module',
        });
      } catch (err: unknown) {
        parseErrors.push({ file: path.basename(file), error: err instanceof Error ? err.message : String(err) });
      }
    }
    expect(parseErrors).toEqual([]);
  });

  it('no file imports dead specifiers (@cancjs/lazy-promise, /iter, /native, cancIter*)', () => {
    const allFiles = corpusFiles();
    const deadPattern = /(@cancjs\/lazy-promise|@cancjs\/[^"'\s]*\/(iter|native)|cancIter)/;
    const violations: { file: string; match: string }[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const match = content.match(deadPattern);
      if (match) {
        violations.push({ file: path.basename(file), match: match[0] });
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('marker comments', () => {
  it('reads one rule with message id and note', () => {
    expect(parseMarkerLine('  } catch (e) { // lint: exhaustive-catch:noRethrow drops ErrorB', 12)).toEqual([
      { line: 12, ruleId: 'exhaustive-catch', messageId: 'noRethrow', note: 'drops ErrorB' },
    ]);
  });

  it('reads several comma-joined rules on one line, sharing the note', () => {
    expect(parseMarkerLine('x(); // lint: no-async-executor,must-consume-lazy:unused async lazy', 3)).toEqual([
      { line: 3, ruleId: 'no-async-executor', note: 'async lazy' },
      { line: 3, ruleId: 'must-consume-lazy', messageId: 'unused', note: 'async lazy' },
    ]);
  });

  it('ignores lines without a marker', () => {
    expect(parseMarkerLine('const a = 1; // first operation', 1)).toEqual([]);
  });
});
