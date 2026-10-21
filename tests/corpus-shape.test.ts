import fs from 'node:fs';
import path from 'node:path';

import tseslintParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

import { CATALOG_RULE_IDS, corpusFiles, readMarkers } from './helpers/corpus.js';

describe('corpus shape: 181 fixtures across 6 families', () => {
  const families = ['coroutine', 'error-handling', 'executor', 'flow', 'hygiene', 'lazy'] as const;

  it('prints per-family counts summing to 181 files', () => {
    const allFiles = corpusFiles();
    expect(allFiles).toHaveLength(181);

    const counts: Record<string, { total: number; valid: number; invalid: number }> = {};
    for (const fam of families) {
      const valid = corpusFiles(fam, 'valid').length;
      const invalid = corpusFiles(fam, 'invalid').length;
      counts[fam] = { total: valid + invalid, valid, invalid };
    }

    const summary = families
      .map((fam) => `${fam}: ${counts[fam].total} (${counts[fam].valid} valid, ${counts[fam].invalid} invalid)`)
      .join(', ');
    console.log(`Corpus shape: 181 files [${summary}]`);

    expect(counts.coroutine.total).toBe(29);
    expect(counts.coroutine.valid).toBe(15);
    expect(counts.coroutine.invalid).toBe(14);

    expect(counts['error-handling'].total).toBe(28);
    expect(counts['error-handling'].valid).toBe(12);
    expect(counts['error-handling'].invalid).toBe(16);

    expect(counts.executor.total).toBe(60);
    expect(counts.executor.valid).toBe(38);
    expect(counts.executor.invalid).toBe(22);

    expect(counts.flow.total).toBe(40);
    expect(counts.flow.valid).toBe(30);
    expect(counts.flow.invalid).toBe(10);

    expect(counts.hygiene.total).toBe(16);
    expect(counts.hygiene.valid).toBe(8);
    expect(counts.hygiene.invalid).toBe(8);

    expect(counts.lazy.total).toBe(8);
    expect(counts.lazy.valid).toBe(4);
    expect(counts.lazy.invalid).toBe(4);

    const sum = Object.values(counts).reduce((acc, c) => acc + c.total, 0);
    expect(sum).toBe(181);
  });

  it('every invalid file has at least 1 marker', () => {
    const invalidFiles = corpusFiles(undefined, 'invalid');
    expect(invalidFiles.length).toBe(74);

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
    expect(validFiles.length).toBe(107);

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
