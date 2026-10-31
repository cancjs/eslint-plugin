import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import rule from '../../src/rules/prefer-cancel-aware-wrapper.js';
import { readMarkers } from '../helpers/corpus.js';
import { ruleTester } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../fixtures/corpus/coroutine');

const invalid14Path = path.join(corpusDir, 'invalid/14-prefer-cancel-aware-wrapper.ts');
const valid12Path = path.join(corpusDir, 'valid/12-prefer-cancel-aware-wrapper.ts');

const codeInvalid14 = fs.readFileSync(invalid14Path, 'utf8');
const codeValid12 = fs.readFileSync(valid12Path, 'utf8');

const markers14 = readMarkers(invalid14Path);

const typedTester = ruleTester({ types: true });
const untypedTester = ruleTester({ types: false });

describe('prefer-cancel-aware-wrapper', () => {
  typedTester.run('prefer-cancel-aware-wrapper (typed)', rule, {
    valid: [
      // 1. Corpus valid twin (uses cancelify)
      codeValid12,

      // 2. Signal used without a finally-abort
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import { createAbortSignal } from '@cancjs/toolbox';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const { signal } = createAbortSignal();
         yield* cancAwait(fetchWithSignal(url, signal));
       });`,

      // 3. Low-level executor adapter (new CancelablePromise, not a coroutine)
      `import CancelablePromise from '@cancjs/promise';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       function adapt(url: string) {
         return new CancelablePromise((resolve, reject, { handleCancel }) => {
           const controller = new AbortController();
           handleCancel(() => controller.abort());
           fetchWithSignal(url, controller.signal).then(resolve, reject);
         });
       }`,

      // 4. Controller created outside the coroutine
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const controller = new AbortController();
       const run = cancAsync(function* (url: string) {
         try {
           yield* cancAwait(fetchWithSignal(url, controller.signal));
         } finally {
           controller.abort();
         }
       });`,

      // 5. Abort in catch block only (not finally)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const controller = new AbortController();
         try {
           yield* cancAwait(fetchWithSignal(url, controller.signal));
         } catch (err) {
           controller.abort();
         }
       });`,

      // 6. Abort inside a nested function's finally (another scope)
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const controller = new AbortController();
         function inner() {
           try {
             fetchWithSignal(url, controller.signal);
           } finally {
             controller.abort();
           }
         }
         inner();
       });`,

      // 7. Synchronous call receiving signal (not a thenable)
      `import { cancAsync } from '@cancjs/coroutine';
       declare function syncFn(s: AbortSignal): void;
       const run = cancAsync(function* () {
         const c = new AbortController();
         try {
           syncFn(c.signal);
         } finally {
           c.abort();
         }
       });`,

      // 8. Signal call outside the try statement whose finally aborts
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function fetchWithSignal(url: string, signal: AbortSignal): Promise<void>;
       const run = cancAsync(function* (url: string) {
         const c = new AbortController();
         yield* cancAwait(fetchWithSignal(url, c.signal));
         try {
           // other work
         } finally {
           c.abort();
         }
       });`,

      // 9. Signal read into a primitive flag before reaching the awaited call
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function save(id: string, aborted: boolean): Promise<void>;
       declare function isAborted(signal: AbortSignal): boolean;
       const run = cancAsync(function* (id: string) {
         const c = new AbortController();
         try {
           yield* cancAwait(save(id, isAborted(c.signal)));
         } finally {
           c.abort();
         }
       });`,

      // 10. Signal read into a string label before reaching the awaited call
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function log(line: string): Promise<void>;
       declare function describe(signal: AbortSignal): 'live' | 'aborted';
       const run = cancAsync(function* () {
         const c = new AbortController();
         try {
           yield* cancAwait(log(describe(c.signal)));
         } finally {
           c.abort();
         }
       });`,
      // 11. Signal reduced to a boolean flag before reaching the awaited call
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       declare function save(url: string, aborted: boolean): Promise<void>;
       declare function isAborted(signal: AbortSignal): boolean;
       const run = cancAsync(function* (url: string) {
         const c = new AbortController();
         try {
           yield* cancAwait(save(url, isAborted(c.signal)));
         } finally {
           c.abort();
         }
       });`,
    ],
    invalid: [
      // 1. Corpus invalid 14 (createAbortSignal with destructuring + abort in finally)
      {
        code: codeInvalid14,
        errors: [
          {
            messageId: 'manualCancelWiring' as const,
            line: markers14[0].line,
            column: 7,
          },
        ],
      },
      // 2. AbortController instance with controller.abort() in finally
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
const run = cancAsync(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        errors: [
          {
            messageId: 'manualCancelWiring' as const,
            line: 11,
            column: 7,
          },
        ],
      },
      // Signal wrapped in an options object before reaching the call
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, init: { signal: AbortSignal }): Promise<void>;
declare function withDefaults(init: { signal: AbortSignal }): { signal: AbortSignal };
const run = cancAsync(function* (id: string) {
  const controller = new AbortController();
  try {
    yield* cancAwait(rawFetch(id, withDefaults({ signal: controller.signal })));
  } finally {
    controller.abort();
  }
});`,
        errors: [{ messageId: 'manualCancelWiring' as const, line: 9, column: 5 }],
      },
      // Signal passed through an any-returning helper
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
declare function pick(value: unknown): any;
const run = cancAsync(function* (id: string) {
  const controller = new AbortController();
  try {
    yield* cancAwait(rawFetch(id, pick(controller.signal)));
  } finally {
    controller.abort();
  }
});`,
        errors: [{ messageId: 'manualCancelWiring' as const, line: 9, column: 5 }],
      },
      // Signal threaded through a void returning callback API
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function fromCallback<T>(fn: (cb: (err: unknown, res: T) => void) => void): Promise<T>;
declare const api: { get(url: string, opts: { signal: AbortSignal }, cb: (err: unknown, res: string) => void): void };
const run = cancAsync(function* (url: string) {
  const c = new AbortController();
  try {
    yield* cancAwait(fromCallback((cb) => api.get(url, { signal: c.signal }, cb)));
  } finally {
    c.abort();
  }
});`,
        errors: [{ messageId: 'manualCancelWiring' as const, line: 9, column: 5 }],
      },
    ],
  });

  untypedTester.run('prefer-cancel-aware-wrapper (untyped)', rule, {
    valid: [
      codeValid12,
      `import { cancAsync, cancAwait } from '@cancjs/coroutine';
       import { createAbortSignal } from '@cancjs/toolbox';
       const run = cancAsync(function* (url) {
         const { signal } = createAbortSignal();
         yield* cancAwait(fetchWithSignal(url, signal));
       });`,
    ],
    invalid: [
      {
        code: codeInvalid14,
        errors: [
          {
            messageId: 'manualCancelWiring' as const,
            line: markers14[0].line,
            column: 7,
          },
        ],
      },
    ],
  });
});

describe('prefer-cancel-aware-wrapper factory options', () => {
  typedTester.run('prefer-cancel-aware-wrapper factory', rule, {
    valid: [
      // same code without the option: not a coroutine
      `import { cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
useX(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
      // replace drops the built-in driver
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
cancAsync(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        options: [{ coroutineFactories: ['onlyMine'] }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
import { useX } from 'other-lib';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
useX(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
      },
    ],
    invalid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
useX(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        options: [{ additionalCoroutineFactories: ['useX'] }],
        errors: [{ messageId: 'manualCancelWiring' as const, line: 11, column: 7 }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
import { useX as u } from '@cancjs/react';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
u(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        options: [{ additionalCoroutineFactories: [{ name: 'useX', source: '@cancjs/react' }] }],
        errors: [{ messageId: 'manualCancelWiring' as const, line: 12, column: 7 }],
      },
      {
        code: `import { cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
ui.setup(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        options: [{ additionalGenCoroutineFactories: ['setup'] }],
        errors: [{ messageId: 'manualCancelWiring' as const, line: 11, column: 7 }],
      },
      // the built-in stays on when the other dialect is replaced
      {
        code: `import { cancAsync, cancAwait } from '@cancjs/coroutine';
declare function rawFetch(id: string, signal: AbortSignal): Promise<void>;
cancAsync(function* (id: string) {
  const controller = new AbortController();
  let done = false;
  try {
    yield* cancAwait(rawFetch(id, controller.signal));
    done = true;
  } finally {
    if (!done) {
      controller.abort();
    }
  }
});`,
        options: [{ genCoroutineFactories: ['onlyMine'] }],
        errors: [{ messageId: 'manualCancelWiring' as const, line: 11, column: 7 }],
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
