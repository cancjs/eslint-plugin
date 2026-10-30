import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { describe } from 'vitest';

import { getAdoptedOperand, getAdoptionForm } from '../src/util/adoption.js';
import { ruleTester } from './setup.js';

type MessageIds = 'form';

const meta: TSESLint.RuleMetaData<MessageIds> = {
  type: 'problem',
  docs: { description: 'probe adoption form detection' },
  messages: { form: '{{form}} {{operand}}' },
  schema: [],
};

// reports every argument of `probe(...)` with its adoption form and adopted operand text
const probeRule: TSESLint.RuleModule<MessageIds, []> = {
  defaultOptions: [],
  meta,
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'probe') {
          return;
        }
        for (const arg of node.arguments) {
          const form = getAdoptionForm(arg, context);
          if (form) {
            const operand = getAdoptedOperand(arg, context);
            context.report({
              node: arg,
              messageId: 'form',
              data: { form, operand: operand ? context.sourceCode.getText(operand) : '-' },
            });
          }
        }
      },
    };
  },
};

// reports every `r(...)` call the helper classifies
const resolveProbeRule: TSESLint.RuleModule<MessageIds, []> = {
  defaultOptions: [],
  meta,
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'r') {
          return;
        }
        const form = getAdoptionForm(node, context);
        if (form) {
          context.report({ node, messageId: 'form', data: { form, operand: '-' } });
        }
      },
    };
  },
};

const HEAD = `import CancelablePromise, { catchCancel, suppressCancel as quiet } from '@cancjs/promise';
import * as promise from '@cancjs/promise';
declare function load(): CancelablePromise<number>;
declare function probe(...args: unknown[]): void;`;

function expectForm(form: string, operand: string) {
  return [{ messageId: 'form' as const, data: { form, operand } }];
}

describe('getAdoptionForm', () => {
  ruleTester({ types: false }).run('adoption-form', probeRule, {
    valid: [
      { name: 'plain call is not an adoption', code: `${HEAD}\nprobe(load());` },
      { name: 'satisfies is not an adoption', code: `${HEAD}\nprobe(load() satisfies Promise<number>);` },
      { name: 'non-null assertion is not an adoption', code: `${HEAD}\nprobe(load()!);` },
      { name: 'cast to a non-promise type is not an adoption', code: `${HEAD}\nprobe(load() as unknown);` },
      {
        name: 'shadowed Promise class is not the global',
        code: `${HEAD}\nclass Promise { static resolve(x: unknown) { return x; } }\nprobe(Promise.resolve(load()));`,
      },
      {
        name: 'imported Promise binding is not the global',
        code: `import { Promise } from './custom-promise';\n${HEAD}\nprobe(new Promise((r) => r(load())));`,
      },
      {
        name: 'executor doing more than resolve is not an adoption',
        code: `${HEAD}\nprobe(new Promise((r) => { log(); r(load()); }));`,
      },
      {
        name: 'local function named like a boundary helper is not tracked',
        code: `${HEAD}\nfunction catchErrors<T>(p: T) { return p; }\nprobe(catchErrors(load()));`,
      },
      {
        name: 'comment before a call paren is not a JSDoc cast',
        code: `${HEAD}\nprobe /** @type {Promise<number>} */ (load());`,
      },
    ],
    invalid: [
      {
        name: 'Promise.resolve on the global',
        code: `${HEAD}\nprobe(Promise.resolve(load()));`,
        errors: expectForm('explicitWrap', 'load()'),
      },
      {
        name: 'new Promise with arrow shorthand',
        code: `${HEAD}\nprobe(new Promise((r) => r(load())));`,
        errors: expectForm('explicitWrap', 'load()'),
      },
      {
        name: 'new Promise with a block body',
        code: `${HEAD}\nprobe(new Promise((resolve) => { resolve(load()); }));`,
        errors: expectForm('explicitWrap', 'load()'),
      },
      {
        name: 'as cast to Promise',
        code: `${HEAD}\nprobe(load() as Promise<number>);`,
        errors: expectForm('asCast', 'load()'),
      },
      {
        name: 'as unknown as cast to PromiseLike',
        code: `${HEAD}\nprobe(load() as unknown as PromiseLike<number>);`,
        errors: expectForm('asCast', 'load()'),
      },
      {
        name: 'angle bracket cast',
        code: `${HEAD}\nprobe(<Promise<number>>load());`,
        errors: expectForm('asCast', 'load()'),
      },
      {
        name: 'JSDoc cast on a parenthesized expression',
        code: `${HEAD}\nprobe(/** @type {Promise<number>} */ (load()));`,
        errors: expectForm('asCast', 'load()'),
      },
      {
        name: 'boundary helper import',
        code: `${HEAD}\nprobe(catchCancel(load()));`,
        errors: expectForm('boundary', 'load()'),
      },
      {
        name: 'renamed boundary helper import',
        code: `${HEAD}\nprobe(quiet(load()));`,
        errors: expectForm('boundary', 'load()'),
      },
      {
        name: 'namespace boundary helper',
        code: `${HEAD}\nprobe(promise.catchCancel(load()));`,
        errors: expectForm('boundary', 'load()'),
      },
      {
        name: 'configured project boundary helper',
        code: `${HEAD}\ndeclare function detach<T>(p: T): T;\nprobe(detach(load()));`,
        settings: { canc: { boundaryFunctions: ['detach'] } },
        errors: expectForm('boundary', 'load()'),
      },
    ],
  });

  ruleTester({ types: false }).run('adoption-resolve-call', resolveProbeRule, {
    valid: [
      { name: 'resolve call outside a Promise executor', code: `declare function r(x: unknown): void;\nr(1);` },
      {
        name: 'resolve call inside a shadowed Promise executor',
        code: `class Promise { constructor(fn: unknown) {} }\nnew Promise((r) => r(1));`,
      },
    ],
    invalid: [
      {
        name: 'resolve call inside a global Promise executor',
        code: `new Promise((r) => r(1));`,
        errors: expectForm('explicitWrap', '-'),
      },
    ],
  });
});
