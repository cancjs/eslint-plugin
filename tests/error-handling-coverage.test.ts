import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { corpusFiles, readMarkers } from './helpers/corpus.js';

const LEGACY_NOTE_TO_MESSAGE_ID: Record<string, string> = {
  'user-initiated cancel produces an error toast': 'swallowedCancel',
  'cancel triggers a retry': 'swallowedCancel',
  'identity check breaks across package copies': 'instanceofCancelError',
  'name strings are not a brand': 'nameCheckCancelError',
  'wrong layer': 'abortErrorWrongLayer',
  'same hazard for promise instances': 'instanceofCancPromise',
};

const REQUIRED_MESSAGE_IDS: Record<string, string[]> = {
  'no-swallowed-cancel': ['swallowedCancel', 'wrappedRethrow', 'destructuredCatch'],
  'prefer-is-cancel-error': [
    'instanceofCancelError',
    'nameCheckCancelError',
    'instanceofCancPromise',
    'abortErrorWrongLayer',
    'preferIsAbortError',
  ],
};

describe('error-handling coverage', () => {
  it('covers both rules with valid and invalid fixtures', () => {
    const validFiles = corpusFiles('error-handling', 'valid');
    const invalidFiles = corpusFiles('error-handling', 'invalid');

    const rules = ['no-swallowed-cancel', 'prefer-is-cancel-error'] as const;

    const validCounts: Record<string, number> = {};
    const invalidCounts: Record<string, number> = {};

    for (const rule of rules) {
      validCounts[rule] = validFiles.filter((f) => path.basename(f).includes(rule)).length;
      invalidCounts[rule] = invalidFiles.filter((f) => path.basename(f).includes(rule)).length;

      expect(validCounts[rule], `Rule ${rule} should have >= 1 valid fixture`).toBeGreaterThanOrEqual(1);
      expect(invalidCounts[rule], `Rule ${rule} should have >= 1 invalid fixture`).toBeGreaterThanOrEqual(1);
    }

    console.log(
      `Per-rule fixture counts: no-swallowed-cancel (${validCounts['no-swallowed-cancel']} valid, ${invalidCounts['no-swallowed-cancel']} invalid), prefer-is-cancel-error (${validCounts['prefer-is-cancel-error']} valid, ${invalidCounts['prefer-is-cancel-error']} invalid)`,
    );
  });

  it('covers every messageId from the Rule contract in >= 1 marker', () => {
    const invalidFiles = corpusFiles('error-handling', 'invalid');

    const messageIdCounts: Record<string, Record<string, number>> = {
      'no-swallowed-cancel': {},
      'prefer-is-cancel-error': {},
    };

    for (const file of invalidFiles) {
      const markers = readMarkers(file);
      for (const m of markers) {
        const ruleId = m.ruleId;
        if (ruleId in messageIdCounts) {
          const msgId = m.messageId ?? (m.note ? LEGACY_NOTE_TO_MESSAGE_ID[m.note] : undefined);
          if (msgId) {
            messageIdCounts[ruleId][msgId] = (messageIdCounts[ruleId][msgId] ?? 0) + 1;
          }
        }
      }
    }

    const summary: string[] = [];
    for (const [ruleId, requiredIds] of Object.entries(REQUIRED_MESSAGE_IDS)) {
      const counts = messageIdCounts[ruleId];
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
});
