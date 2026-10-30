import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe } from 'vitest';

import rule from '../../src/rules/exhaustive-catch.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/failure');

const invalid05Path = path.join(corpusDir, 'invalid/05-exhaustive-catch-unhandled.ts');
const invalid16Path = path.join(corpusDir, 'invalid/16-exhaustive-catch-timeout.ts');
const invalid06Path = path.join(corpusDir, 'invalid/06-exhaustive-catch-no-rethrow.ts');
const invalid07Path = path.join(corpusDir, 'invalid/07-exhaustive-catch-open-set.ts');

const valid14Path = path.join(corpusDir, 'valid/14-closed-set-fully-narrowed.ts');
const valid15Path = path.join(corpusDir, 'valid/15-open-set-fallback-rethrow.ts');
const valid16Path = path.join(corpusDir, 'valid/16-timeout-handled.ts');

const codeInvalid05 = fs.readFileSync(invalid05Path, 'utf8');
const codeInvalid16 = fs.readFileSync(invalid16Path, 'utf8');
const codeInvalid06 = fs.readFileSync(invalid06Path, 'utf8');
const codeInvalid07 = fs.readFileSync(invalid07Path, 'utf8');

const codeValid14 = fs.readFileSync(valid14Path, 'utf8');
const codeValid15 = fs.readFileSync(valid15Path, 'utf8');
const codeValid16 = fs.readFileSync(valid16Path, 'utf8');

const markers05 = readMarkers(invalid05Path);
const markers16 = readMarkers(invalid16Path);
const markers06 = readMarkers(invalid06Path);
const markers07 = readMarkers(invalid07Path);

function unionCatch(catchBody: string): string {
  return `import { isErrorOf } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
declare function log(e: unknown): boolean;
declare const flag: boolean;
declare const mode: string;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    ${catchBody}
  }
});`;
}

const q3Or = unionCatch(`if (isErrorOf(e, ErrorA) || log(e)) {
      console.log('handled');
    } else {
      throw e;
    }`);
const q3OrCond = unionCatch(`if (e instanceof ErrorA || flag) {
      console.log('handled');
    } else {
      throw e;
    }`);
const q3NotOr = unionCatch(`if (!(e instanceof ErrorA || flag)) throw e;
    console.log('handled');`);

function withThrow(code: string): string {
  return code.replace(/\n {2}}\n}\);$/, '\n    throw e;\n  }\n});');
}

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('exhaustive-catch (typed lane)', () => {
  typedTester.run('exhaustive-catch', rule, {
    valid: [
      // Early negated instanceof guard rethrows the rest
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (!(e instanceof ErrorA)) {
      throw e;
    }
    console.log(e.kind);
  }
});`,
      // Early negated isErrorOf guard rethrows the rest
      `import { isErrorOf } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (!isErrorOf(e, ErrorA)) throw e;
    console.log(e.kind);
  }
});`,
      // Switch default rethrows the rest
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    switch (true) {
      case e instanceof ErrorA:
        console.log('A');
        break;
      default:
        throw e;
    }
  }
});`,
      // Early negated discriminant comparison rethrows the rest
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (e.kind !== 'ErrorA') throw e;
    console.log(e.kind);
  }
});`,
      // Switch on a binding discriminant with a default rethrow
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    switch (e.kind) {
      case 'ErrorA':
        console.log('A');
        break;
      default:
        throw e;
    }
  }
});`,
      // Valid corpus twins
      codeValid14,
      codeValid15,
      codeValid16,
      // Closed set fully narrowed without rethrow (valid)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       class ErrorB extends Error {}
       declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getUnion());
         } catch (e) {
           if (e instanceof ErrorA) {
             console.log('A');
           } else if (e instanceof ErrorB) {
             console.log('B');
           }
         }
       });`,
      // Open set without fallback but requireUnlistedFallback: false (valid)
      {
        code: codeInvalid07,
        options: [{ requireUnlistedFallback: false }],
      },
      // Native Promise step contributes nothing (silent)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function getNative(): Promise<string>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getNative());
         } catch (e) {
           console.error(e);
         }
       });`,
      // One-arg undeclared CancelablePromise step (silent: report nothing)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       declare function getUndeclared(): CancelablePromise<string>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getUndeclared());
         } catch (e) {
           console.error(e);
         }
       });`,
      // yield* inside nested arrow function (excluded from try step walk)
      `import { cancAsync } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       declare function getA(): CancelablePromise<string, ErrorA>;
       export const run = cancAsync(function* () {
         try {
           const helper = function* () {
             yield* getA();
           };
           console.log('safe');
         } catch (e) {
           console.error(e);
         }
       });`,
      // Delegate failure is never (silent)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       declare function getNever(): CancelablePromise<string, never>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getNever());
         } catch (e) {
           console.error(e);
         }
       });`,
      // Try / finally without catch (never report)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       declare function getA(): CancelablePromise<string, ErrorA>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getA());
         } finally {
           console.log('clean');
         }
       });`,
      // Unconditional rethrow in catch body
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       declare function getA(): CancelablePromise<string, ErrorA>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getA());
         } catch (e) {
           console.error(e);
           throw e;
         }
       });`,
      // Catch rethrowing inside an else branch
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import type CancelablePromise from '@cancjs/promise';
       class ErrorA extends Error {}
       class ErrorB extends Error {}
       declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
       export const run = cancAsync(function* () {
         try {
           yield* cancAwait(getUnion());
         } catch (e) {
           if (e instanceof ErrorA) {
             console.log('A');
           } else {
             throw e;
           }
         }
       });`,
      // Exclude option drops matching class
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
               import type CancelablePromise from '@cancjs/promise';
               class AssertionError extends Error {}
               declare function getAssert(): CancelablePromise<string, AssertionError>;
               export const run = cancAsync(function* () {
                 try {
                   yield* cancAwait(getAssert());
                 } catch (e) {
                   console.error(e);
                 }
               });`,
        options: [{ exclude: ['AssertionError'] }],
      },
    ],
    invalid: [
      // Default import under a non-canonical local name resolves through the canc symbol
      {
        code: `import type CP from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';

class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }

declare function load(): CP<string, ErrorA | ErrorB>;

export const run = cancAsync(function* () {
  try {
    yield* cancAwait(load());
  } catch (e) {
    console.error(e);
  }
});`,
        output: null,
        errors: [{ messageId: 'unhandledFailure', line: 12, data: { names: 'ErrorA, ErrorB' } }],
      },
      // 1. Timeout step fixture: names = TimeoutError only, Unlisted never named!
      {
        code: codeInvalid16,
        output: null,
        errors: [
          {
            messageId: 'unhandledFailure',
            line: markers16[0].line,
            data: { names: 'TimeoutError' },
          },
        ],
      },
      // 2. Unhandled failure with two errors (ErrorA, ErrorB)
      {
        code: codeInvalid05,
        output: null,
        errors: [
          {
            messageId: 'unhandledFailure',
            line: markers05[0].line,
            data: { names: 'ErrorA, ErrorB' },
          },
        ],
      },
      // 3. noRethrow: ErrorA handled, ErrorB dropped without rethrow
      {
        code: codeInvalid06,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            line: markers06[0].line,
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: [
              {
                messageId: 'noRethrow',
                data: { names: 'ErrorB', handled: 'ErrorA' },
                output: codeInvalid06.replace('    }\n  }', '    }\n    throw e;\n  }'),
              },
            ],
          },
        ],
      },
      // 4. missingUnlistedFallback on open set
      {
        code: codeInvalid07,
        output: null,
        errors: [
          {
            messageId: 'missingUnlistedFallback',
            line: markers07[0].line,
            suggestions: [
              {
                messageId: 'missingUnlistedFallback',
                output: codeInvalid07.replace('    }\n  }', '    }\n    throw e;\n  }'),
              },
            ],
          },
        ],
      },
      // 5. Unrelated if/else rethrow does not cover failures
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
declare function getA(): CancelablePromise<string, ErrorA>;
declare const unrelatedFlag: boolean;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getA());
  } catch (e) {
    if (unrelatedFlag) {
      console.log('swallowed');
    } else {
      throw e;
    }
  }
});`,
        output: null,
        errors: [
          {
            messageId: 'unhandledFailure',
            data: { names: 'ErrorA' },
          },
        ],
      },
      // 6. allowRethrow: false reports without duplicate throw suggestion
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (e instanceof ErrorA) {
      console.log('A');
    } else {
      throw e;
    }
  }
});`,
        options: [{ allowRethrow: false }],
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: null,
          },
        ],
      },
      // 7. Shadowed catch binding suppresses suggestion
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (e instanceof ErrorA) {
      const e = 'shadowed';
      console.log(e);
    }
  }
});`,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: null,
          },
        ],
      },
      // A call that is not a type guard does not narrow the binding
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
declare function log(e: unknown): boolean;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getUnion());
  } catch (e) {
    if (log(e)) {
      console.log('logged');
    } else {
      throw e;
    }
  }
});`,
        output: null,
        errors: [{ messageId: 'unhandledFailure', data: { names: 'ErrorA, ErrorB' } }],
      },
      // Inner try without a handler throws to the swallowing outer catch
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    try {
      yield* cancAwait(getUnion());
    } finally {
      console.log('cleanup');
    }
  } catch (e) {
    console.log('swallowed');
  }
});`,
        output: null,
        errors: [{ messageId: 'unhandledFailure', data: { names: 'ErrorA, ErrorB' } }],
      },
      // `||` with a non-guard operand does not narrow: `isErrorOf(e, A) || log(e)`
      {
        code: q3Or,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: [
              { messageId: 'noRethrow', data: { names: 'ErrorB', handled: 'ErrorA' }, output: withThrow(q3Or) },
            ],
          },
        ],
      },
      // `||` with a non-guard operand does not narrow: `A || cond`
      {
        code: q3OrCond,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: [
              { messageId: 'noRethrow', data: { names: 'ErrorB', handled: 'ErrorA' }, output: withThrow(q3OrCond) },
            ],
          },
        ],
      },
      // Negated `||` with a non-guard operand is no early rethrow: `!(A || cond)`
      {
        code: q3NotOr,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: [
              { messageId: 'noRethrow', data: { names: 'ErrorB', handled: 'ErrorA' }, output: withThrow(q3NotOr) },
            ],
          },
        ],
      },
      // Inner catch that logs and rethrows still reaches the swallowing outer catch
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    try {
      yield* cancAwait(getUnion());
    } catch (inner) {
      console.error(inner);
      throw inner;
    }
  } catch (e) {
    console.log('swallowed');
  }
});`,
        output: null,
        errors: [{ messageId: 'unhandledFailure', data: { names: 'ErrorA, ErrorB' } }],
      },
      // Switch default rethrow does not count when the cases are not guards
      {
        code: unionCatch(`switch (mode) {
      case 'quiet':
        break;
      default:
        throw e;
    }`),
        output: null,
        errors: [{ messageId: 'unhandledFailure', data: { names: 'ErrorA, ErrorB' } }],
      },
      // Early swallowing exit before the fallback rethrow
      {
        code: unionCatch(`if (flag) return;
    throw e;`),
        output: null,
        errors: [{ messageId: 'unhandledFailure', data: { names: 'ErrorA, ErrorB' } }],
      },
      // 8. Inner try/catch yield throws to outer catch
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
declare function getA(): CancelablePromise<string, ErrorA>;
export const run = cancAsync(function* () {
  try {
    try {
      console.log('inner try');
    } catch (innerErr) {
      yield* cancAwait(getA());
    }
  } catch (e) {
    console.log('outer catch');
  }
});`,
        output: null,
        errors: [
          {
            messageId: 'unhandledFailure',
            data: { names: 'ErrorA' },
          },
        ],
      },
    ],
  });
});

describe('exhaustive-catch (untyped lane)', () => {
  untypedTester.run('exhaustive-catch-untyped', rule, {
    valid: [
      // Without parser services, rule degrades silently with zero messages
      codeInvalid05,
      codeInvalid16,
      codeInvalid06,
      codeInvalid07,
    ],
    invalid: [],
  });
});
