import type { TSESLint } from '@typescript-eslint/utils';

import { ruleTester } from './setup.js';

// Trivial inline rule (no createRule) proving the RuleTester + vitest wiring works:
// reports every debugger statement.
const noDebuggerRule: TSESLint.RuleModule<'unexpectedDebugger', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow debugger statements',
    },
    messages: {
      unexpectedDebugger: 'Unexpected debugger statement.',
    },
    schema: [],
  },
  create(context) {
    return {
      DebuggerStatement(node) {
        context.report({ node, messageId: 'unexpectedDebugger' });
      },
    };
  },
};

describe('harness: no-debugger (typed)', () => {
  ruleTester().run('no-debugger', noDebuggerRule, {
    valid: ['const a = 1;'],
    invalid: [
      {
        code: 'debugger;',
        errors: [{ messageId: 'unexpectedDebugger' }],
      },
    ],
  });
});

describe('harness: no-debugger (untyped)', () => {
  ruleTester({ typeScript: false }).run('no-debugger', noDebuggerRule, {
    valid: ['const a = 1;'],
    invalid: [
      {
        code: 'debugger;',
        errors: [{ messageId: 'unexpectedDebugger' }],
      },
    ],
  });
});
