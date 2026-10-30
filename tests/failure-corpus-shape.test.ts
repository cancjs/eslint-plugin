import fs from 'node:fs';
import path from 'node:path';

import tseslintParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

import { CATALOG_RULE_IDS, corpusFiles, readMarkers } from './helpers/corpus.js';

const FAILURE_RULE_IDS = [
  'prefer-canc-throw',
  'canc-throw-tail-position',
  'exhaustive-catch',
  'require-error-discriminant',
  'no-failure-widening',
  'no-throw-in-chain-callback',
] as const;

const REQUIRED_MESSAGE_IDS: Record<(typeof FAILURE_RULE_IDS)[number], string[]> = {
  'prefer-canc-throw': ['preferCancThrow'],
  'canc-throw-tail-position': ['cancThrowTailPosition'],
  'exhaustive-catch': ['unhandledFailure', 'noRethrow', 'missingUnlistedFallback'],
  'require-error-discriminant': ['missingDiscriminant'],
  'no-failure-widening': ['failureWidening'],
  'no-throw-in-chain-callback': ['throwInChainCallback', 'rejectWithoutFailure'],
};

const RULE_TOPIC_MATCHERS: Record<(typeof FAILURE_RULE_IDS)[number], (filename: string) => boolean> = {
  'prefer-canc-throw': (f) =>
    f.includes('canc-throw') ||
    f.includes('inferred-coroutine') ||
    f.includes('outer-annotated') ||
    f.includes('body-annotated') ||
    f.includes('coroutine-rethrow'),
  'canc-throw-tail-position': (f) => f.includes('canc-throw'),
  'exhaustive-catch': (f) =>
    f.includes('catch') ||
    f.includes('suppress-errors') ||
    f.includes('guard-as-set') ||
    f.includes('narrowed') ||
    f.includes('open-set') ||
    f.includes('timeout-handled'),
  'require-error-discriminant': (f) => f.includes('discriminant'),
  'no-failure-widening': (f) => f.includes('widening') || f.includes('erasure') || f.includes('with-failure'),
  'no-throw-in-chain-callback': (f) => f.includes('chain'),
};

describe('failure corpus shape', () => {
  it('covers all six failure rules with valid and invalid fixtures', () => {
    const validFiles = corpusFiles('failure', 'valid');
    const invalidFiles = corpusFiles('failure', 'invalid');

    expect(validFiles.length, 'failure family should have fixtures').toBeGreaterThanOrEqual(14);
    expect(invalidFiles.length, 'failure family should have invalid fixtures').toBeGreaterThanOrEqual(6);

    const validCounts: Record<string, number> = {};
    const invalidCounts: Record<string, number> = {};
    const summary: string[] = [];

    for (const rule of FAILURE_RULE_IDS) {
      const matcher = RULE_TOPIC_MATCHERS[rule];
      validCounts[rule] = validFiles.filter((f) => matcher(path.basename(f))).length;
      invalidCounts[rule] = invalidFiles.filter((f) => {
        const markers = readMarkers(f);
        return markers.some((m) => m.ruleId === rule);
      }).length;

      summary.push(`${rule} (${validCounts[rule]} valid, ${invalidCounts[rule]} invalid)`);

      expect(validCounts[rule], `Rule ${rule} should have >= 1 valid fixture`).toBeGreaterThanOrEqual(1);
      expect(invalidCounts[rule], `Rule ${rule} should have >= 1 invalid fixture`).toBeGreaterThanOrEqual(1);
    }

    console.log(`Per-rule fixture counts: ${summary.join(', ')}`);
  });

  it('verifies every invalid file has a marker with an id in CATALOG_RULE_IDS', () => {
    const invalidFiles = corpusFiles('failure', 'invalid');
    const catalogSet = new Set<string>(CATALOG_RULE_IDS);

    for (const file of invalidFiles) {
      const markers = readMarkers(file);
      expect(markers.length, `File ${path.basename(file)} must contain >= 1 marker`).toBeGreaterThanOrEqual(1);

      for (const marker of markers) {
        expect(catalogSet.has(marker.ruleId), `Marker ruleId ${marker.ruleId} must be in CATALOG_RULE_IDS`).toBe(true);
      }
    }
  });

  it('covers every messageId from the Rule contract in >= 1 marker', () => {
    const invalidFiles = corpusFiles('failure', 'invalid');
    const messageIdCounts: Record<string, Record<string, number>> = {};

    for (const rule of FAILURE_RULE_IDS) {
      messageIdCounts[rule] = {};
    }

    for (const file of invalidFiles) {
      const markers = readMarkers(file);
      for (const m of markers) {
        const ruleId = m.ruleId;
        if (ruleId in messageIdCounts) {
          const msgId = m.messageId;
          if (msgId) {
            messageIdCounts[ruleId][msgId] = (messageIdCounts[ruleId][msgId] ?? 0) + 1;
          }
        }
      }
    }

    const summary: string[] = [];
    for (const [ruleId, requiredIds] of Object.entries(REQUIRED_MESSAGE_IDS)) {
      const counts = messageIdCounts[ruleId] ?? {};
      const countsStr = requiredIds.map((id) => `${id}: ${counts[id] ?? 0}`).join(', ');
      summary.push(`${ruleId}: [${countsStr}]`);

      for (const msgId of requiredIds) {
        const count = counts[msgId] ?? 0;
        if (count === 0) {
          throw new Error(`messageId ${msgId} has no marker`);
        }
        expect(count, `messageId ${msgId} has no marker`).toBeGreaterThanOrEqual(1);
      }
    }

    console.log(`Per-rule messageId counts: ${summary.join('; ')}`);
  });

  it('parses every failure corpus fixture with @typescript-eslint/parser', () => {
    const allFiles = corpusFiles('failure');
    for (const file of allFiles) {
      const code = fs.readFileSync(file, 'utf8');
      expect(
        () => {
          tseslintParser.parse(code, {
            sourceType: 'module',
            ecmaVersion: 'latest',
          });
        },
        `File ${path.basename(file)} should parse without errors`,
      ).not.toThrow();
    }
  });
});
