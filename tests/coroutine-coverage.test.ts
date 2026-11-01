import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { corpusFiles, readMarkers } from './helpers/corpus.js';

const LEGACY_NOTE_TO_MESSAGE_ID: Record<string, string> = {
  'async function passed to cancAsync': 'asyncFunction',
  'async generator passed to cancAsync': 'asyncGenerator',
  'any return annotation collapses every step type': 'anyReturnAnnotation',
  'missing star, resumes with a generator object': 'missingStar',
  'cancAwait result unused, step never runs': 'unusedCancAwait',
  'untyped step, prefer yield* cancAwait()': 'preferCancAwait',
  'cancAwait inside cancGenAsync': 'cancAwaitInIter',
  'cancGenAwait inside cancAsync': 'iterAwaitInCancAsync',
  'cancForAwait inside cancGenAsync': 'forAwaitInIter',
  'async callback escapes the cancel chain': 'asyncLoopCallback',
  'plain promise, work continues after cancel': 'gapStep',
  'gap in the chain': 'gapChainStep',
  'never subscribed, never runs': 'unusedLazy',
  'local lazy promise never consumed; function returns without starting it': 'unusedLazyVar',
  'listener never removed': 'manualSignalWiring',
  'pre-abort handled by the signal option': 'preAbortCheck',
  'added per call on a reused signal, never removed': 'leakedAbortListener',
  'bare keyword-looking binding': 'keywordAlias',
  'prefer the exported canonical names': 'preferAlias',
  'hand-rolled cancel propagation': 'manualCancelWiring',
};

const REQUIRED_MESSAGE_IDS: Record<string, string[]> = {
  'no-yield-await-in-loop': ['serializedSteps'],
  'valid-cancasync': ['asyncFunction', 'asyncGenerator', 'anyReturnAnnotation', 'syncFunction'],
  'no-unstarred-cancawait': ['missingStar', 'unusedCancAwait'],
  'prefer-cancawait': ['preferCancAwait'],
  'no-coroutine-dialect-mismatch': [
    'cancAwaitInIter',
    'iterAwaitInCancAsync',
    'forAwaitInIter',
    'iterForAwaitInCancAsync',
  ],
  'no-cancellation-gap': ['gapStep', 'gapChainStep'],
  'must-consume-lazy': ['unusedLazy', 'unusedLazyVar'],
  'prefer-signal-option': ['manualSignalWiring', 'preAbortCheck'],
  'no-abort-listener-leak': ['leakedAbortListener', 'inlineListenerNoOnce'],
  'no-internal-imports': ['internalImport'],
  'no-keyword-alias-import': ['keywordAlias', 'preferAlias'],
  'prefer-cancel-aware-wrapper': ['manualCancelWiring'],
  'no-async-loop-callback': ['asyncLoopCallback'],
  'prefer-canceled-property': ['preferCanceledProperty'],
  'prefer-signal-accessor': ['preferSignalAccessor'],
};

const RULE_TOPIC_MATCHERS: Record<string, (filename: string) => boolean> = {
  'valid-cancasync': (f) => f.includes('valid-cancasync'),
  'no-unstarred-cancawait': (f) => f.includes('no-unstarred-cancawait'),
  'prefer-cancawait': (f) => f.includes('prefer-cancawait'),
  'no-coroutine-dialect-mismatch': (f) => f.includes('dialect-mismatch'),
  'no-cancellation-gap': (f) => f.includes('no-cancellation-gap'),
  'no-yield-await-in-loop': (f) => f.includes('no-yield-await-in-loop'),
  'must-consume-lazy': (f) => f.includes('must-consume-lazy'),
  'prefer-signal-option': (f) => f.includes('prefer-signal-option'),
  'no-abort-listener-leak': (f) => f.includes('no-abort-listener-leak'),
  'no-internal-imports': (f) => f.includes('no-internal-imports'),
  'no-keyword-alias-import': (f) => f.includes('no-keyword-alias-import'),
  'prefer-cancel-aware-wrapper': (f) => f.includes('prefer-cancel-aware-wrapper'),
  'no-async-loop-callback': (f) => f.includes('no-async-loop-callback'),
  'prefer-canceled-property': (f) => f.includes('prefer-canceled-property'),
  'prefer-signal-accessor': (f) => f.includes('prefer-signal-accessor'),
};

describe('coroutine coverage', () => {
  it('covers all 15 phase rules with valid and invalid fixtures', () => {
    const validFiles = [
      ...corpusFiles('coroutine', 'valid'),
      ...corpusFiles('lazy', 'valid'),
      ...corpusFiles('hygiene', 'valid'),
    ];
    const invalidFiles = [
      ...corpusFiles('coroutine', 'invalid'),
      ...corpusFiles('lazy', 'invalid'),
      ...corpusFiles('hygiene', 'invalid'),
    ];

    const validCounts: Record<string, number> = {};
    const invalidCounts: Record<string, number> = {};

    const summary: string[] = [];
    for (const [rule, matcher] of Object.entries(RULE_TOPIC_MATCHERS)) {
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

  it('covers every messageId from the Rule contract in >= 1 marker', () => {
    const invalidFiles = [
      ...corpusFiles('coroutine', 'invalid'),
      ...corpusFiles('lazy', 'invalid'),
      ...corpusFiles('hygiene', 'invalid'),
    ];

    const messageIdCounts: Record<string, Record<string, number>> = {};
    for (const rule of Object.keys(REQUIRED_MESSAGE_IDS)) {
      messageIdCounts[rule] = {};
    }

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
});
