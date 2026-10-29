import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { describe } from 'vitest';

import {
  getCancServices,
  isCancelableExpression,
  isCancelableType,
  isLazyType,
  typeIsPlainPromiseSink,
} from '../src/util/canc-types.js';
import { getCancSettings } from '../src/util/settings.js';
import { ruleTester } from './setup.js';

type MessageIds = 'cancelable' | 'lazy' | 'plainSink' | 'noServices';

// Dummy probe rule: classifies declarators using canc-types helpers
// Valid and invalid assertions become a behavioral spec for detection
// Declarator with cancelable type reports cancelable
// Declarator with lazy type reports lazy
// Plain non-cancelable promise sink reports plainSink
// When type services are absent the rule reports noServices on Program
const probeRule: TSESLint.RuleModule<MessageIds, []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'probe canc type detection' },
    messages: {
      cancelable: 'cancelable',
      lazy: 'lazy',
      plainSink: 'plainSink',
      noServices: 'noServices',
    },
    schema: [],
  },
  create(context) {
    const settings = getCancSettings(context);
    const services = getCancServices(context);

    if (!services) {
      return {
        Program(node) {
          context.report({ node, messageId: 'noServices' });
        },
      };
    }

    const checker = services.program.getTypeChecker();

    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (!node.init) {
          return;
        }

        const type = services.getTypeAtLocation(node.init);

        if (isLazyType(type, checker, settings)) {
          context.report({ node: node.init, messageId: 'lazy' });
          return;
        }

        if (isCancelableType(type, checker, settings) || isCancelableExpression(node.init, context, settings)) {
          context.report({ node: node.init, messageId: 'cancelable' });
          return;
        }

        if (typeIsPlainPromiseSink(type, checker, settings)) {
          context.report({ node: node.init, messageId: 'plainSink' });
        }
      },
    };
  },
};

const importPromise = `import { CancelablePromise } from '@cancjs/promise';\n`;
const importLazy = `import { LazyPromise } from '@cancjs/toolbox';\n`;

describe('canc-types: typed detection', () => {
  ruleTester().run('probe', probeRule, {
    valid: [
      // Plain native Promise is not cancelable and not a lazy
      // It is a plain sink with bare Promise.resolve asserted below
      // A value that is neither thenable nor canc produces no report
      `${importPromise}const n = 1;`,
      // User class named CancelablePromise without canc import -> neither cancelable nor lazy
      `class CancelablePromise { isCanceled = false; }
       const p = new CancelablePromise();`,
      // User type alias named CancelablePromise -> not cancelable
      `type CancelablePromise<T> = { value: T };
       const p: CancelablePromise<number> = { value: 1 };`,
      // User class named LazyPromise without canc import -> not lazy
      `class LazyPromise { run() {} }
       const p = new LazyPromise();`,
    ],
    invalid: [
      {
        // CancelablePromise variable -> cancelable
        code: `${importPromise}const p = CancelablePromise.resolve(1);`,
        errors: [{ messageId: 'cancelable' }],
      },
      {
        // Subclass of CancelablePromise -> cancelable (walks base types)
        code: `${importPromise}class MyCancelable extends CancelablePromise<number> {}\nconst p = MyCancelable.resolve(1) as MyCancelable;`,
        errors: [{ messageId: 'cancelable' }],
      },
      {
        // new CancelablePromise(...) -> cancelable
        code: `${importPromise}const p = new CancelablePromise<number>((resolve) => resolve(1));`,
        errors: [{ messageId: 'cancelable' }],
      },
      {
        // Plain Promise -> NOT cancelable, but IS a plain promise sink
        code: `${importPromise}const p = Promise.resolve(1);`,
        errors: [{ messageId: 'plainSink' }],
      },
      {
        // Union Promise | CancelablePromise is not a plain sink
        // The union is cancelable because a union member matches
        // The cancelable report proves typeIsPlainPromiseSink returned false
        code: `${importPromise}declare const u: Promise<number> | CancelablePromise<number>;\nconst p = u;`,
        errors: [{ messageId: 'cancelable' }],
      },
      {
        // LazyPromise -> lazy, not cancelable-promise
        code: `${importLazy}const p = new LazyPromise<number>((resolve) => resolve(1));`,
        errors: [{ messageId: 'lazy' }],
      },
    ],
  });
});

describe('canc-types: untyped degrade', () => {
  // No projectService: getCancServices returns null, rule reports noServices once, never throws.
  ruleTester({ types: false }).run('probe', probeRule, {
    valid: [],
    invalid: [
      {
        code: `const p = 1;`,
        errors: [{ messageId: 'noServices' }],
      },
    ],
  });
});
