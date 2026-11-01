import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

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

function nsCatch(catchBody: string): string {
  return `import * as canc from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
class WrappedError extends Error { constructor(readonly cause: unknown) { super('wrapped'); } }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
declare const flag: boolean;
export const run = canc.cancAsync(function* () {
  try {
    yield* canc.cancAwait(getUnion());
  } catch (e) {
    ${catchBody}
  }
});`;
}

function openCatch(catchBody: string): string {
  return `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { Unlisted } from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getOpen(): CancelablePromise<string, ErrorA | ErrorB | Unlisted>;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getOpen());
  } catch (e) {
    ${catchBody}
  }
});`;
}

function nestedCatch(innerBody: string, outerBody: string): string {
  return `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class ErrorB extends Error { readonly kind = 'ErrorB'; }
declare function getUnion(): CancelablePromise<string, ErrorA | ErrorB>;
export const run = cancAsync(function* () {
  try {
    try {
      yield* cancAwait(getUnion());
    } catch (inner) {
      ${innerBody}
    }
  } catch (e) {
    ${outerBody}
  }
});`;
}

function withThrow(code: string): string {
  return code.replace(/\n {2}}\n}\);$/, '\n    throw e;\n  }\n});');
}

const s3LogOnly = nestedCatch(
  `if (inner instanceof ErrorA) {
        console.log('A');
      }
      throw inner;`,
  `if (e instanceof ErrorB) {
      console.log('B');
    }`,
);

const outerLogB = `if (e instanceof ErrorB) {
      console.log('B');
    }`;

const s3IfElseRethrow = nestedCatch(
  `if (inner instanceof ErrorA) {
        console.log(inner);
        throw inner;
      } else {
        throw inner;
      }`,
  outerLogB,
);

const s3SwitchRethrow = nestedCatch(
  `switch (true) {
        case inner instanceof ErrorA:
          console.log(inner);
          throw inner;
        default:
          throw inner;
      }`,
  outerLogB,
);

const s3LaterConditionalRethrow = nestedCatch(
  `if (inner instanceof ErrorA) {
        console.log(inner);
      }
      if (flag) throw inner;`,
  outerLogB,
).replace('export const run', 'declare const flag: boolean;\nexport const run');

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
      // Returning a wrapped canc.throw leaves by throwing, so the fallback still covers the rest
      nsCatch(`if (flag) return yield* canc.throw(new WrappedError(e));
    throw e;`),
      // Documented wrap form inside a guarded branch
      nsCatch(`if (e instanceof ErrorA) {
      return yield* canc.throw(new WrappedError(e));
    }
    throw e;`),
      // Wrapped cancThrow return before the fallback
      `import { cancAsync, cancAwait, cancThrow } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class WrappedError extends Error {}
declare function getA(): CancelablePromise<string, ErrorA>;
declare const flag: boolean;
export const run = cancAsync(function* () {
  try {
    yield* cancAwait(getA());
  } catch (e) {
    if (flag) return yield* cancThrow(new WrappedError());
    throw e;
  }
});`,
      // Wrapped cancGen.throw return before the fallback
      `import { cancGenAsync, cancGen } from '@cancjs/coroutine/gen';
import type CancelablePromise from '@cancjs/promise';
class ErrorA extends Error { readonly kind = 'ErrorA'; }
class WrappedError extends Error {}
declare function getA(): CancelablePromise<string, ErrorA>;
declare const flag: boolean;
export const run = cancGenAsync(function* () {
  try {
    yield* getA();
  } catch (e) {
    if (flag) return yield* cancGen.throw(new WrappedError());
    throw e;
  }
});`,
      // Switch on a cast binding discriminant
      unionCatch(`switch ((e as ErrorA | ErrorB).kind) {
      case 'ErrorA':
        console.log('A');
        break;
      case 'ErrorB':
        console.log('B');
        break;
      default:
        throw e;
    }`),
      // Negated compare on an angle-bracket cast binding rethrows the rest
      unionCatch(`if ((<ErrorA>e).kind !== 'ErrorA') throw e;
    console.log('A');`),
      // Positive compare on a non-null binding with an else rethrow
      unionCatch(`if (e!.name === 'ErrorA') {
      console.log('A');
    } else {
      throw e;
    }`),
      // De Morgan early rethrow is a fallback for the open set
      openCatch(`if (!(e instanceof ErrorA) && !(e instanceof ErrorB)) throw e;
    console.log('handled');`),
      // Inner catch handles ErrorA and rethrows the rest, outer handles ErrorB
      nestedCatch(
        `if (!(inner instanceof ErrorA)) throw inner;
      console.log('A');`,
        `if (e instanceof ErrorB) {
      console.log('B');
    }`,
      ),
      // Inner catch handles ErrorA with an early exit before its rethrow
      nestedCatch(
        `if (inner instanceof ErrorA) {
        console.log('A');
        return;
      }
      throw inner;`,
        `if (e instanceof ErrorB) {
      console.log('B');
    }`,
      ),
      // Inner catch keeps ErrorA with an early return and rethrows the rest
      nestedCatch(
        `if (inner instanceof ErrorA) {
        return 1;
      }
      throw inner;`,
        outerLogB,
      ),
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
      // A negated compare does not guard the exit under it
      {
        code: unionCatch(`if (e.kind !== 'ErrorA') return;
    throw e;`),
        output: null,
        errors: [{ messageId: 'unhandledFailure', data: { names: 'ErrorA, ErrorB' } }],
      },
      // Inner catch that only logs ErrorA still rethrows it to the outer catch
      {
        code: s3LogOnly,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            data: { names: 'ErrorA', handled: 'ErrorB' },
            suggestions: [
              { messageId: 'noRethrow', data: { names: 'ErrorA', handled: 'ErrorB' }, output: withThrow(s3LogOnly) },
            ],
          },
        ],
      },
      // Inner guard branch that rethrows still passes ErrorA to the outer catch
      {
        code: s3IfElseRethrow,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            line: 18,
            column: 5,
            data: { names: 'ErrorA', handled: 'ErrorB' },
            suggestions: [
              {
                messageId: 'noRethrow',
                data: { names: 'ErrorA', handled: 'ErrorB' },
                output: withThrow(s3IfElseRethrow),
              },
            ],
          },
        ],
      },
      // Inner switch case that rethrows still passes ErrorA to the outer catch
      {
        code: s3SwitchRethrow,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            line: 19,
            column: 5,
            data: { names: 'ErrorA', handled: 'ErrorB' },
            suggestions: [
              {
                messageId: 'noRethrow',
                data: { names: 'ErrorA', handled: 'ErrorB' },
                output: withThrow(s3SwitchRethrow),
              },
            ],
          },
        ],
      },
      // A later conditional rethrow can still pass the logged ErrorA to the outer catch
      {
        code: s3LaterConditionalRethrow,
        output: null,
        errors: [
          {
            messageId: 'noRethrow',
            line: 11,
            column: 7,
            data: { names: 'ErrorB', handled: 'ErrorA' },
            suggestions: [
              {
                messageId: 'noRethrow',
                data: { names: 'ErrorB', handled: 'ErrorA' },
                output: s3LaterConditionalRethrow.replace(
                  'if (flag) throw inner;\n    }',
                  'if (flag) throw inner;\n      throw inner;\n  }',
                ),
              },
            ],
          },
          {
            messageId: 'noRethrow',
            line: 17,
            column: 5,
            data: { names: 'ErrorA', handled: 'ErrorB' },
            suggestions: [
              {
                messageId: 'noRethrow',
                data: { names: 'ErrorA', handled: 'ErrorB' },
                output: withThrow(s3LaterConditionalRethrow),
              },
            ],
          },
        ],
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

describe('exhaustive-catch factory options', () => {
  typedTester.run('exhaustive-catch factory', rule, {
    valid: [
      // same code without the option: not a coroutine
      `import { cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

useX(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch {
    console.error('failed');
  }
});`,
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

useX(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch (e) {
    throw e;
  }
});`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
      },
      // replace drops the built-in driver
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

cancAsync(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch {
    console.error('failed');
  }
});`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
    ],
    invalid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

useX(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch {
    console.error('failed');
  }
});`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        output: null,
        errors: [{ messageId: 'unhandledFailure' as const, line: 12, data: { names: 'TimeoutError' } }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

ui.setup(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch {
    console.error('failed');
  }
});`,
        options: [{ additionalGenCoroutineFactories: ['setup'] }],
        output: null,
        errors: [{ messageId: 'unhandledFailure' as const, line: 12, data: { names: 'TimeoutError' } }],
      },
      {
        code: `import { useX as u } from '@cancjs/react';
import { cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

u(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch {
    console.error('failed');
  }
});`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
        output: null,
        errors: [{ messageId: 'unhandledFailure' as const, line: 13, data: { names: 'TimeoutError' } }],
      },
      // the built-in stays on when the other dialect is replaced
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
import type CancelablePromise from '@cancjs/promise';
import type { TimeoutError } from '@cancjs/toolbox';
import type { Unlisted } from '@cancjs/promise';

declare function timeout<T>(p: CancelablePromise<T>, ms: number): CancelablePromise<T, TimeoutError | Unlisted>;
declare const p: CancelablePromise<string>;

cancAsync(function* () {
  try {
    yield* cancAwait(timeout(p, 10));
  } catch {
    console.error('failed');
  }
});`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
        output: null,
        errors: [{ messageId: 'unhandledFailure' as const, line: 12, data: { names: 'TimeoutError' } }],
      },
    ],
  });

  it('rejects add and replace of one dialect together', () => {
    const linter = new Linter({ configType: 'flat' });
    const verify = (options: object) =>
      linter.verify('', [
        { plugins: { canc: { rules: { r: rule as never } } }, rules: { 'canc/r': ['error', options] } },
      ]);
    expect(() => verify({ additionalCoroutineFactories: ['a'], coroutineFactories: ['b'] })).toThrow(
      /should NOT be valid/,
    );
    expect(() => verify({ additionalGenCoroutineFactories: ['a'], genCoroutineFactories: ['b'] })).toThrow(
      /should NOT be valid/,
    );
    expect(() => verify({ additionalCoroutineFactories: ['a'], genCoroutineFactories: ['b'] })).not.toThrow();
  });
});
