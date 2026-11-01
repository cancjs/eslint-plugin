import { describe } from 'vitest';

import exhaustiveCatch from '../src/rules/exhaustive-catch.js';
import noAsyncLoopCallback from '../src/rules/no-async-loop-callback.js';
import noAwaitCancelableInAsync from '../src/rules/no-await-cancelable-in-async.js';
import noCancelabilityErasure from '../src/rules/no-cancelability-erasure.js';
import noCancellationGap from '../src/rules/no-cancellation-gap.js';
import noSwallowedCancel from '../src/rules/no-swallowed-cancel.js';
import noThrowInChainCallback from '../src/rules/no-throw-in-chain-callback.js';
import preferCancCombinators from '../src/rules/prefer-canc-combinators.js';
import preferCanceledProperty from '../src/rules/prefer-canceled-property.js';
import preferIsCancelError from '../src/rules/prefer-is-cancel-error.js';
import { ruleTester } from './setup.js';

const tester = ruleTester({ typeScript: true, types: true });

const HEAD = `interface Task<T> extends PromiseLike<T> {
  cancel(): void;
  isCanceled: boolean;
}
declare function getTask(): Task<number>;
`;

const settingsStructural = {
  canc: {
    structuralDetection: true,
  },
};

describe('structural-detection', () => {
  describe('Group A & B: structural detection enabled reports foreign Task', () => {
    tester.run('no-cancelability-erasure', noCancelabilityErasure, {
      valid: [
        {
          name: 'default (off) is silent on foreign Task',
          code: `${HEAD}
const p: Promise<number> = getTask();`,
        },
      ],
      invalid: [
        {
          name: 'structuralDetection: true reports Task assigned to Promise',
          code: `${HEAD}
const p: Promise<number> = getTask();`,
          settings: settingsStructural,
          errors: [{ messageId: 'erasedAssignment' }],
        },
      ],
    });

    tester.run('no-cancellation-gap', noCancellationGap, {
      valid: [
        {
          name: 'default (off) is silent on foreign Task chain',
          code: `${HEAD}
declare function legacyAudit(n: number): Promise<void>;
getTask().then((n) => legacyAudit(n));`,
        },
      ],
      invalid: [
        {
          name: 'structuralDetection: true reports gap on Task chain',
          code: `${HEAD}
declare function legacyAudit(n: number): Promise<void>;
getTask().then((n) => legacyAudit(n));`,
          settings: settingsStructural,
          errors: [{ messageId: 'gapChainStep' }],
        },
      ],
    });

    tester.run('no-await-cancelable-in-async', noAwaitCancelableInAsync, {
      valid: [
        {
          name: 'default (off) is silent on awaiting Task',
          code: `${HEAD}
async function run() {
  await getTask();
}`,
        },
      ],
      invalid: [
        {
          name: 'structuralDetection: true reports awaiting Task in async',
          code: `${HEAD}
async function run() {
  await getTask();
}`,
          settings: settingsStructural,
          errors: [{ messageId: 'awaitErasesCancelability' }],
        },
      ],
    });

    tester.run('prefer-canc-combinators', preferCancCombinators, {
      valid: [
        {
          name: 'default (off) is silent on Promise.all([task])',
          code: `${HEAD}
Promise.all([getTask()]);`,
        },
      ],
      invalid: [
        {
          name: 'structuralDetection: true reports Promise.all with Task',
          code: `${HEAD}
Promise.all([getTask()]);`,
          settings: settingsStructural,
          errors: [
            {
              messageId: 'preferCancCombinator',
              suggestions: [
                {
                  messageId: 'suggestUseCancelablePromise',
                  output: `${HEAD}
CancelablePromise.all([getTask()]);`,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  describe('Group C: canc-only rules stay silent on foreign Task even with structuralDetection: true', () => {
    tester.run('no-throw-in-chain-callback', noThrowInChainCallback, {
      valid: [
        {
          name: 'silent under default',
          code: `${HEAD}
getTask().then(() => {
  throw new Error('fail');
});`,
        },
        {
          name: 'silent under structuralDetection: true',
          code: `${HEAD}
getTask().then(() => {
  throw new Error('fail');
});`,
          settings: settingsStructural,
        },
      ],
      invalid: [],
    });

    tester.run('prefer-canceled-property', preferCanceledProperty, {
      valid: [
        {
          name: 'silent under default',
          code: `${HEAD}
const t = getTask();
const c = t.isCanceled;`,
        },
        {
          name: 'silent under structuralDetection: true',
          code: `${HEAD}
const t = getTask();
const c = t.isCanceled;`,
          settings: settingsStructural,
        },
      ],
      invalid: [],
    });

    tester.run('no-async-loop-callback', noAsyncLoopCallback, {
      valid: [
        {
          name: 'silent under default',
          code: `${HEAD}
[1].forEach(async () => {
  getTask();
});`,
        },
        {
          name: 'silent under structuralDetection: true',
          code: `${HEAD}
[1].forEach(async () => {
  getTask();
});`,
          settings: settingsStructural,
        },
      ],
      invalid: [],
    });

    tester.run('no-swallowed-cancel', noSwallowedCancel, {
      valid: [
        {
          name: 'silent under default',
          code: `${HEAD}
async function run() {
  try {
    await getTask();
  } catch (e) {
    console.error(e);
  }
}`,
        },
        {
          name: 'silent under structuralDetection: true',
          code: `${HEAD}
async function run() {
  try {
    await getTask();
  } catch (e) {
    console.error(e);
  }
}`,
          settings: settingsStructural,
        },
      ],
      invalid: [],
    });

    tester.run('prefer-is-cancel-error', preferIsCancelError, {
      valid: [
        {
          name: 'silent under default',
          code: `${HEAD}
async function run() {
  try {
    await getTask();
  } catch (e) {
    if (e instanceof Error) {}
  }
}`,
        },
        {
          name: 'silent under structuralDetection: true',
          code: `${HEAD}
async function run() {
  try {
    await getTask();
  } catch (e) {
    if (e instanceof Error) {}
  }
}`,
          settings: settingsStructural,
        },
      ],
      invalid: [],
    });

    tester.run('exhaustive-catch', exhaustiveCatch, {
      valid: [
        {
          name: 'silent under default',
          code: `${HEAD}
async function run() {
  try {
    await getTask();
  } catch (e) {}
}`,
        },
        {
          name: 'silent under structuralDetection: true',
          code: `${HEAD}
async function run() {
  try {
    await getTask();
  } catch (e) {}
}`,
          settings: settingsStructural,
        },
      ],
      invalid: [],
    });
  });
});
