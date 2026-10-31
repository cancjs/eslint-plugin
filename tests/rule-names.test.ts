import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rules } from '../src/rules/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rule ids are public API: adding or removing one is a deliberate edit here
const PUBLIC_RULE_IDS = [
  'canc-throw-tail-position',
  'exhaustive-catch',
  'executor-cancel-wiring',
  'executor-param-names',
  'handle-cancel-first',
  'must-consume-lazy',
  'no-abort-listener-leak',
  'no-async-executor',
  'no-async-loop-callback',
  'no-await-cancelable-in-async',
  'no-cancelability-erasure',
  'no-cancellation-gap',
  'no-coroutine-dialect-mismatch',
  'no-executor-return',
  'no-failure-widening',
  'no-internal-imports',
  'no-keyword-alias-import',
  'no-multistep-executor',
  'no-swallowed-cancel',
  'no-throw-in-chain-callback',
  'no-transform-in-executor',
  'no-unstarred-cancawait',
  'no-yield-await-in-loop',
  'prefer-canc-combinators',
  'prefer-canc-throw',
  'prefer-cancawait',
  'prefer-cancel-aware-wrapper',
  'prefer-canceled-property',
  'prefer-is-cancel-error',
  'prefer-signal-accessor',
  'prefer-signal-option',
  'prefer-signal-over-controller',
  'require-error-discriminant',
  'require-loop-advance',
  'require-signal-forwarding',
  'valid-canc-params',
  'valid-cancasync',
].sort();

describe('public rule ids', () => {
  it('matches the pinned list exactly', () => {
    expect(Object.keys(rules).sort()).toEqual(PUBLIC_RULE_IDS);
  });

  it('has a doc page for every id', () => {
    const missing = PUBLIC_RULE_IDS.filter(
      (id) => !fs.existsSync(path.join(__dirname, '..', 'docs', 'rules', `${id}.md`)),
    );
    expect(missing).toEqual([]);
  });

  it('has no doc page without a rule', () => {
    const pages = fs
      .readdirSync(path.join(__dirname, '..', 'docs', 'rules'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .sort();
    expect(pages).toEqual(PUBLIC_RULE_IDS);
  });
});
