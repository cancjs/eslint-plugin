import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { describe } from 'vitest';

import {
  getCancServices,
  isCancDeclaredCallee,
  isCancelableExpression,
  isCancelableType,
  isLazyType,
  isPlainPromiseContextualSink,
  isPlainPromiseReturnSink,
  sinkMatchesSomeSpecifier,
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
        // Object-type alias with the canc shape, declared outside a canc package: plain sink only
        code: `type CancelablePromise<T> = { then: Promise<T>['then']; cancel(): void; isCanceled: boolean };
               declare const src: CancelablePromise<number>;
               const p = src;`,
        errors: [{ messageId: 'plainSink' }],
      },
      {
        // Same through an interface carrying the canc shape
        code: `interface Shape<T> extends Promise<T> { cancel(): void; isCanceled: boolean }
               type CancelablePromise<T> = Shape<T>;
               declare const src: CancelablePromise<number>;
               const p = src;`,
        errors: [{ messageId: 'plainSink' }],
      },
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

type SinkMessageIds = 'contextualSink' | 'returnSink' | 'cancCallee' | 'safeSink';

// reports sink helper verdicts for initializers, call arguments, returns and calls
const sinkProbeRule: TSESLint.RuleModule<SinkMessageIds, []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'probe sink type helpers' },
    messages: {
      contextualSink: 'contextualSink',
      returnSink: 'returnSink',
      cancCallee: 'cancCallee',
      safeSink: 'safeSink',
    },
    schema: [],
  },
  create(context) {
    return {
      'VariableDeclarator > .init'(node: TSESTree.Expression) {
        if (isPlainPromiseContextualSink(node, context)) {
          context.report({ node, messageId: 'contextualSink' });
        }
      },
      'CallExpression > .arguments'(node: TSESTree.Expression) {
        if (isPlainPromiseContextualSink(node, context)) {
          context.report({ node, messageId: 'contextualSink' });
        }
        if (sinkMatchesSomeSpecifier(node, [{ from: 'file', name: 'safe' }], context)) {
          context.report({ node, messageId: 'safeSink' });
        }
      },
      ReturnStatement(node: TSESTree.ReturnStatement) {
        let fn: TSESTree.Node | undefined = node.parent;
        while (fn && fn.type !== AST_NODE_TYPES.FunctionDeclaration) {
          fn = fn.parent;
        }
        if (fn?.type === AST_NODE_TYPES.FunctionDeclaration && isPlainPromiseReturnSink(fn, context)) {
          context.report({ node, messageId: 'returnSink' });
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        if (isCancDeclaredCallee(node, context)) {
          context.report({ node, messageId: 'cancCallee' });
        }
      },
    };
  },
};

describe('canc-types: sink helpers', () => {
  ruleTester().run('sink-probe', sinkProbeRule, {
    valid: [
      `const p: CancelablePromiseLikeAlias = 1;
type CancelablePromiseLikeAlias = number;`,
      `declare function keep(p: number): void;
keep(1);`,
      `function run(): number {
  return 1;
}`,
      `${importPromise}declare function sink(p: Promise<number> | CancelablePromise<number>): void;
sink(Promise.resolve(1));`,
    ],
    invalid: [
      {
        code: `const p: Promise<number> = Promise.resolve(1);`,
        errors: [{ messageId: 'contextualSink' }],
      },
      {
        code: `declare function put(key: string, p: Promise<number>): void;
declare function put(p: PromiseLike<number>): void;
put('a', Promise.resolve(1));`,
        errors: [{ messageId: 'contextualSink', line: 3, column: 10 }],
      },
      {
        code: `async function run(): Promise<number> {
  return 1;
}`,
        errors: [{ messageId: 'returnSink' }],
      },
      {
        code: `${importPromise}CancelablePromise.resolve(1);`,
        errors: [{ messageId: 'cancCallee' }],
      },
      {
        code: `declare function safe(p: Promise<number>): void;
safe(Promise.resolve(1));`,
        errors: [{ messageId: 'contextualSink' }, { messageId: 'safeSink' }],
      },
    ],
  });

  ruleTester({ types: false }).run('sink-probe-untyped', sinkProbeRule, {
    valid: [
      `const p: Promise<number> = Promise.resolve(1);`,
      `async function run(): Promise<number> {
  return 1;
}`,
    ],
    invalid: [],
  });
});
