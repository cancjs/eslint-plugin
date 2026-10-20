import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus');

// Closed list of the 36 planned catalog rule names.
export const CATALOG_RULE_IDS = [
  'no-async-executor',
  'no-executor-return',
  'no-multistep-executor',
  'no-transform-in-executor',
  'handle-cancel-first',
  'require-signal-forwarding',
  'executor-cancel-wiring',
  'executor-param-names',
  'valid-canc-params',
  'prefer-signal-over-controller',
  'no-cancelability-erasure',
  'no-await-cancelable-in-async',
  'prefer-canc-combinators',
  'no-swallowed-cancel',
  'prefer-is-cancel-error',
  'valid-cancasync',
  'no-unstarred-cancawait',
  'prefer-cancawait',
  'no-coroutine-dialect-mismatch',
  'no-cancellation-gap',
  'no-yield-await-in-loop',
  'must-consume-lazy',
  'prefer-signal-option',
  'no-abort-listener-leak',
  'no-internal-imports',
  'no-keyword-alias-import',
  'prefer-cancel-aware-wrapper',
  'no-async-loop-callback',
  'prefer-signal-accessor',
  'prefer-canceled-property',
  'prefer-canc-throw',
  'canc-throw-tail-position',
  'exhaustive-catch',
  'require-error-discriminant',
  'no-failure-widening',
  'no-throw-in-chain-callback',
] as const;

export type CatalogRuleId = (typeof CATALOG_RULE_IDS)[number];

export interface CorpusMarker {
  line: number;
  ruleId: string;
  messageId?: string;
  note?: string;
}

export function readMarkers(file: string): CorpusMarker[] {
  const filePath =
    path.isAbsolute(file) ? file
    : fs.existsSync(file) ? path.resolve(file)
    : path.resolve(corpusDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const markers: CorpusMarker[] = [];
  const markerRegex = /\/\/\s*lint:\s*([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?(?:\s+(.*?))?\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(markerRegex);
    if (match) {
      const marker: CorpusMarker = {
        line: i + 1,
        ruleId: match[1],
      };
      if (match[2]) {
        marker.messageId = match[2];
      }
      if (match[3]) {
        marker.note = match[3].trim();
      }
      markers.push(marker);
    }
  }

  return markers;
}

export function corpusFiles(family?: string, kind?: 'valid' | 'invalid'): string[] {
  function walk(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) {
      return results;
    }
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        results.push(...walk(full));
      } else if (entry.endsWith('.ts')) {
        results.push(full);
      }
    }
    return results;
  }

  let files = walk(corpusDir);

  if (family) {
    const familySegment = `${path.sep}${family}${path.sep}`;
    files = files.filter((f) => f.includes(familySegment) || f.replaceAll('\\', '/').includes(`/${family}/`));
  }

  if (kind) {
    const kindSegment = `${path.sep}${kind}${path.sep}`;
    files = files.filter((f) => f.includes(kindSegment) || f.replaceAll('\\', '/').includes(`/${kind}/`));
  }

  return files.sort();
}
