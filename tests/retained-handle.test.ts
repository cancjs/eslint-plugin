import type { TSESLint } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { describe } from 'vitest';

import { hasRetainedHandle } from '../src/util/retained-handle.js';
import { ruleTester } from './setup.js';

type MessageIds = 'retained';

// reports every identifier argument of `probe(...)` that has a retained cancel handle
const probeRule: TSESLint.RuleModule<MessageIds, []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'probe retained handle scan' },
    messages: { retained: 'retained' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'probe') {
          return;
        }
        for (const arg of node.arguments) {
          if (arg.type === AST_NODE_TYPES.Identifier && hasRetainedHandle(arg, context.sourceCode.getScope(arg))) {
            context.report({ node: arg, messageId: 'retained' });
          }
        }
      },
    };
  },
};

const RETAINED = [{ messageId: 'retained' as const }];

describe('hasRetainedHandle', () => {
  ruleTester({ types: false }).run('retained-handle', probeRule, {
    valid: [
      { name: 'no cancel path', code: `const job = load();\nprobe(job);` },
      { name: 'var declaration does not count', code: `var job = load();\nprobe(job);\njob.cancel();` },
      { name: 'parameter does not count', code: `function run(job) {\n  probe(job);\n  job.cancel();\n}` },
      {
        name: 'binding from an outer function scope does not count',
        code: `const job = load();\nfunction run() {\n  probe(job);\n}\njob.cancel();`,
      },
      { name: 'computed member access does not count', code: `const job = load();\nprobe(job);\njob[name];` },
      {
        name: 'withResolvers without cancel does not count',
        code: `const { promise } = CancelablePromise.withResolvers();\nprobe(promise);`,
      },
      {
        name: 'signal of a non-controller does not count',
        code: `const source = makeSource();\nconst job = start({ signal: source.signal });\nprobe(job);`,
      },
      {
        name: 'ref option on a plain call does not count',
        code: `const job = load();\nprobe(job);\nhold({ ref: job });`,
      },
    ],
    invalid: [
      {
        name: 'cancel access in the same scope',
        code: `const job = load();\nprobe(job);\njob.cancel();`,
        errors: RETAINED,
      },
      {
        name: 'cancel access inside a nested callback',
        code: `const job = load();\nprobe(job);\nonTeardown(() => void job.cancel());`,
        errors: RETAINED,
      },
      {
        name: 'let binding with a cancel access',
        code: `function run() {\n  let job = load();\n  probe(job);\n  return () => job.cancel();\n}`,
        errors: RETAINED,
      },
      {
        name: 'ref option of a new expression',
        code: `const job = load();\nprobe(job);\nnew Holder({ ref: job });`,
        errors: RETAINED,
      },
      {
        name: 'withResolvers promise with cancel',
        code: `const { promise, cancel } = CancelablePromise.withResolvers();\nprobe(promise);`,
        errors: RETAINED,
      },
      {
        name: 'signal of a local AbortController',
        code: `const controller = new AbortController();\nconst job = start({ signal: controller.signal });\nprobe(job);`,
        errors: RETAINED,
      },
    ],
  });
});
