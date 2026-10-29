import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/no-keyword-alias-import.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/hygiene');

const invalid07Path = path.join(corpusDir, 'invalid/07-no-keyword-alias-import-bare-binding.ts');
const invalid08Path = path.join(corpusDir, 'invalid/08-no-keyword-alias-import-renamed.ts');

const valid07Path = path.join(corpusDir, 'valid/07-no-keyword-alias-import-canonical-names.ts');
const valid08Path = path.join(corpusDir, 'valid/08-no-keyword-alias-import-namespace-form.ts');
const valid12Path = path.join(corpusDir, 'valid/12-no-keyword-alias-import-alias-table.ts');

const codeInvalid07 = fs.readFileSync(invalid07Path, 'utf8');
const codeInvalid08 = fs.readFileSync(invalid08Path, 'utf8');

const codeValid07 = fs.readFileSync(valid07Path, 'utf8');
const codeValid08 = fs.readFileSync(valid08Path, 'utf8');
const codeValid12 = fs.readFileSync(valid12Path, 'utf8');

const markers07 = readMarkers(invalid07Path);
const markers08 = readMarkers(invalid08Path);

const tester = ruleTester({ types: false });

describe('no-keyword-alias-import', () => {
  tester.run('no-keyword-alias-import', rule, {
    valid: [
      codeValid07,
      codeValid08,
      codeValid12,
      // Type-only import declaration
      `import type { async } from '@cancjs/coroutine';`,
      // Specifier-level type-only import
      `import { type async, type await as cawait } from '@cancjs/coroutine';`,
      // Namespace import
      `import * as coroutine from '@cancjs/coroutine';
       import * as gen from '@cancjs/coroutine/gen';
       void coroutine.async;
       void gen.delegate;`,
      // Unrelated source
      `import { async, await as cawait } from 'other-module';
       void async;
       void cawait;`,
      // Canonical imports from gen
      `import { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenDelegate, cancGenThrow } from '@cancjs/coroutine/gen';
       void cancGenAsync;
       void cancGenAwait;
       void cancGenForAwait;
       void cancGenDelegate;
       void cancGenThrow;`,
    ],
    invalid: [
      {
        code: codeInvalid07,
        output: [
          `// Source: hygiene.md > canc/no-keyword-alias-import > Incorrect (bare keyword-looking binding)
import { cancAsync, await as cawait } from '@cancjs/coroutine'; // lint: no-keyword-alias-import:keywordAlias bare keyword-looking binding

const load = cancAsync(function* () {
 /* ... */
});
void cawait;
void load;

`,
          `// Source: hygiene.md > canc/no-keyword-alias-import > Incorrect (bare keyword-looking binding)
import { cancAsync, cancAwait } from '@cancjs/coroutine'; // lint: no-keyword-alias-import:keywordAlias bare keyword-looking binding

const load = cancAsync(function* () {
 /* ... */
});
void cancAwait;
void load;

`,
        ],
        errors: [
          {
            messageId: 'keywordAlias' as const,
            line: markers07[0].line,
            data: { name: 'async', canonical: 'cancAsync', source: '@cancjs/coroutine' },
          },
          {
            messageId: 'preferAlias' as const,
            line: markers07[0].line,
            data: { name: 'await', local: 'cawait', canonical: 'cancAwait', source: '@cancjs/coroutine' },
          },
        ],
      },
      {
        code: codeInvalid08,
        output: `// Source: hygiene.md > canc/no-keyword-alias-import > Incorrect (renamed but still alias)
import { cancAsync, cancAwait } from '@cancjs/coroutine'; // lint: no-keyword-alias-import:preferAlias prefer the exported canonical names

void cancAsync;
void cancAwait;

`,
        errors: [
          {
            messageId: 'preferAlias' as const,
            line: markers08[0].line,
            data: { name: 'async', local: 'cancAsync', canonical: 'cancAsync', source: '@cancjs/coroutine' },
          },
          {
            messageId: 'preferAlias' as const,
            line: markers08[0].line,
            data: { name: 'await', local: 'cancAwait', canonical: 'cancAwait', source: '@cancjs/coroutine' },
          },
        ],
      },
      // Multi-reference rename for bare keyword alias
      {
        code: `import { async } from '@cancjs/coroutine';
const a = async(function* () {});
const b = async(function* () {});
void a;
void b;`,
        output: `import { cancAsync } from '@cancjs/coroutine';
const a = cancAsync(function* () {});
const b = cancAsync(function* () {});
void a;
void b;`,
        errors: [
          {
            messageId: 'keywordAlias' as const,
            data: { name: 'async', canonical: 'cancAsync', source: '@cancjs/coroutine' },
          },
        ],
      },
      // Multi-reference rename for gen aliases: forAwait and delegate
      {
        code: `import { forAwait, delegate } from '@cancjs/coroutine/gen';
function* run(src: any) {
  yield* forAwait(src, function* (x: any) {});
  yield* delegate(src);
}`,
        output: [
          `import { cancGenForAwait, delegate } from '@cancjs/coroutine/gen';
function* run(src: any) {
  yield* cancGenForAwait(src, function* (x: any) {});
  yield* delegate(src);
}`,
          `import { cancGenForAwait, cancGenDelegate } from '@cancjs/coroutine/gen';
function* run(src: any) {
  yield* cancGenForAwait(src, function* (x: any) {});
  yield* cancGenDelegate(src);
}`,
        ],
        errors: [
          {
            messageId: 'keywordAlias' as const,
            data: { name: 'forAwait', canonical: 'cancGenForAwait', source: '@cancjs/coroutine/gen' },
          },
          {
            messageId: 'keywordAlias' as const,
            data: { name: 'delegate', canonical: 'cancGenDelegate', source: '@cancjs/coroutine/gen' },
          },
        ],
      },
      // preferAlias for renamed alias from gen
      {
        code: `import { throw as cGenThrow } from '@cancjs/coroutine/gen';
void cGenThrow;`,
        output: `import { cancGenThrow } from '@cancjs/coroutine/gen';
void cancGenThrow;`,
        errors: [
          {
            messageId: 'preferAlias' as const,
            data: { name: 'throw', local: 'cGenThrow', canonical: 'cancGenThrow', source: '@cancjs/coroutine/gen' },
          },
        ],
      },
      // Collision protection: when canonical name already exists, report but do not autofix
      {
        code: `import { async } from '@cancjs/coroutine';
const cancAsync = 123;
void async;
void cancAsync;`,
        output: null,
        errors: [
          {
            messageId: 'keywordAlias' as const,
            data: { name: 'async', canonical: 'cancAsync', source: '@cancjs/coroutine' },
          },
        ],
      },
    ],
  });
});
