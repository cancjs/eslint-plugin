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

// Dummy probe rule: classifies each `let`/`const` declarator initializer by exercising the
// canc-types helpers, so RuleTester valid/invalid assertions become a behavioral spec for them.
// A declarator with an initializer whose type is cancelable reports `cancelable`; lazy reports
// `lazy`; a plain (non-cancelable) promise sink reports `plainSink`. When type services are absent
// the rule reports `noServices` once on Program (proves graceful degradation).
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
const importLazy = `import { LazyPromise } from '@cancjs/lazy-promise';\n`;

describe('canc-types: typed detection', () => {
  ruleTester().run('probe', probeRule, {
    valid: [
      // Plain native Promise is not cancelable and not a lazy; it IS a plain sink, but a bare
      // `const p = Promise.resolve(1)` is asserted in the invalid block below. Here: a value that
      // is neither thenable nor canc produces no report at all.
      `${importPromise}const n = 1;`,
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
        // Union Promise | CancelablePromise -> NOT a plain sink (union contains cancelable),
        // and IS cancelable (a union member matches). The `cancelable` report, not `plainSink`,
        // proves typeIsPlainPromiseSink returned false for the union.
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
