import tseslintParser from '@typescript-eslint/parser';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
import { describe, expect, it } from 'vitest';

import {
  type CancBinding,
  type CoroutineFn,
  getCancBindings,
  isCancAwaitIdent,
  isCancCtorIdent,
  isCancForAwaitNext,
  isCancGenAwaitIdent,
  isCoroutineFnIdent,
  isHelperIdent,
  isLazyCtorIdent,
  isThrowHelperCall,
  isWithFailureIdent,
  refersTo,
} from '../src/util/canc-imports.js';
import { ruleTester } from './setup.js';

const tester = ruleTester({ types: false });

type Ctx = TSESLint.RuleContext<'hit' | 'canc' | 'cancGen', unknown[]>;

/**
 * Build a rule that reports `hit` on every callee of a CallExpression that the
 * given predicate accepts. Callees may be an Identifier (named/default forms) or
 * a MemberExpression (namespace forms), so predicates receive the callee node.
 */
function probeRule(predicate: (node: TSESTree.Node, context: Ctx) => boolean): TSESLint.RuleModule<'hit', []> {
  return {
    meta: {
      type: 'problem',
      messages: { hit: 'hit' },
      schema: [],
    },
    defaultOptions: [],
    create(context) {
      const check = (node: TSESTree.CallExpression | TSESTree.NewExpression) => {
        if (predicate(node.callee, context)) {
          context.report({ node: node.callee, messageId: 'hit' });
        }
      };
      return {
        CallExpression: check,
        NewExpression: check,
      };
    },
  };
}

const ctorRule = probeRule((node, ctx) => isCancCtorIdent(node, ctx));
const cancAwaitRule = probeRule((node, ctx) => isCancAwaitIdent(node, ctx));
const cancGenAwaitRule = probeRule((node, ctx) => isCancGenAwaitIdent(node, ctx));
const coroutineRule = (which: CoroutineFn) => probeRule((node, ctx) => isCoroutineFnIdent(node, ctx, which));
const helperRule = (name: string) => probeRule((node, ctx) => isHelperIdent(node, ctx, name));
const withFailureRule = probeRule((node, ctx) => isWithFailureIdent(node, ctx));
const lazyCtorRule = probeRule((node, ctx) => isLazyCtorIdent(node, ctx));
const refersToRule = (exported: string) => probeRule((node, ctx) => refersTo(node, ctx, exported));

const throwHelperRule: TSESLint.RuleModule<'canc' | 'cancGen', []> = {
  meta: {
    type: 'problem',
    messages: { canc: 'canc', cancGen: 'cancGen' },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const res = isThrowHelperCall(node, context);
        if (res) {
          context.report({ node, messageId: res.dialect });
        }
      },
    };
  },
};

const forAwaitNextRule: TSESLint.RuleModule<'hit', []> = {
  meta: {
    type: 'problem',
    messages: { hit: 'hit' },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      MemberExpression(node) {
        if (isCancForAwaitNext(node, context)) {
          context.report({ node, messageId: 'hit' });
        }
      },
    };
  },
};

describe('canc-imports: getCancBindings', () => {
  function bindingsFor(code: string): Map<string, CancBinding> {
    let captured = new Map<string, CancBinding>();
    const captureRule: TSESLint.RuleModule<'x', []> = {
      meta: { type: 'problem', messages: { x: 'x' }, schema: [] },
      defaultOptions: [],
      create(context) {
        return {
          Program() {
            captured = getCancBindings(context);
          },
        };
      },
    };
    const linter = new Linter();
    linter.verify(code, {
      languageOptions: { parser: tseslintParser, sourceType: 'module' },
      plugins: { probe: { rules: { capture: captureRule } } },
      rules: { 'probe/capture': 'error' },
    });
    return captured;
  }

  it('named import records the exported name', () => {
    const b = bindingsFor(`import { CancelablePromise } from '@cancjs/promise';`);
    expect(b.get('CancelablePromise')).toEqual({
      source: '@cancjs/promise',
      exported: 'CancelablePromise',
      namespace: false,
    });
  });

  it('renamed import keeps the exported name, keys by local', () => {
    const b = bindingsFor(`import { CancelablePromise as CP } from '@cancjs/promise';`);
    expect(b.get('CP')).toEqual({
      source: '@cancjs/promise',
      exported: 'CancelablePromise',
      namespace: false,
    });
    expect(b.has('CancelablePromise')).toBe(false);
  });

  it('default import records exported default', () => {
    const b = bindingsFor(`import CP from '@cancjs/promise';`);
    expect(b.get('CP')).toEqual({
      source: '@cancjs/promise',
      exported: 'default',
      namespace: false,
    });
  });

  it('namespace import is flagged as namespace', () => {
    const b = bindingsFor(`import * as canc from '@cancjs/coroutine';`);
    expect(b.get('canc')).toEqual({ source: '@cancjs/coroutine', exported: '*', namespace: true });
  });

  it('require destructure records renamed key', () => {
    const b = bindingsFor(`const { cancAsync: ca } = require('@cancjs/coroutine');`);
    expect(b.get('ca')).toEqual({
      source: '@cancjs/coroutine',
      exported: 'cancAsync',
      namespace: false,
    });
  });

  it('require namespace is flagged as namespace', () => {
    const b = bindingsFor(`const canc = require('@cancjs/coroutine');`);
    expect(b.get('canc')).toEqual({ source: '@cancjs/coroutine', exported: '*', namespace: true });
  });

  it('non-canc source is ignored', () => {
    const b = bindingsFor(`import { CancelablePromise } from 'other-lib';`);
    expect(b.size).toBe(0);
  });
});

describe('canc-imports: isCancCtorIdent', () => {
  tester.run('ctor', ctorRule, {
    valid: [
      `import { CancelablePromise } from 'bluebird'; new CancelablePromise(() => {});`,
      `
 import { CancelablePromise } from '@cancjs/promise';
 function f() {
 class CancelablePromise {}
 new CancelablePromise();
 }
 `,
      `
 import { CancelablePromise } from '@cancjs/promise';
 function g(CancelablePromise) {
 return new CancelablePromise();
 }
 `,
    ],
    invalid: [
      {
        code: `import { CancelablePromise } from '@cancjs/promise'; new CancelablePromise(() => {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed',
        code: `import { CancelablePromise as CP } from '@cancjs/promise'; new CP(() => {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'default import',
        code: `import CP from '@cancjs/promise'; new CP(() => {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'require destructure',
        code: `const { CancelablePromise } = require('@cancjs/promise'); new CancelablePromise(() => {});`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});

describe('canc-imports: isCoroutineFnIdent', () => {
  tester.run('cancAsync', coroutineRule('cancAsync'), {
    valid: [
      `import { cancAsync } from 'other'; cancAsync(function* () {});`,
      `const co = { cancAsync() {} }; co.cancAsync();`,
    ],
    invalid: [
      {
        code: `import { cancAsync } from '@cancjs/coroutine'; cancAsync(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member co.cancAsync',
        code: `import * as co from '@cancjs/coroutine'; co.cancAsync(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member co.async',
        code: `import * as co from '@cancjs/coroutine'; co.async(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'require namespace member',
        code: `const co = require('@cancjs/coroutine'); co.cancAsync(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('cancGenAsync', coroutineRule('cancGenAsync'), {
    valid: [
      `import { cancGenAsync } from 'x'; cancGenAsync();`,
      `
 import { cancGenAsync } from '@cancjs/coroutine/gen';
 function outer() {
 const cancGenAsync = () => {};
 cancGenAsync();
 }
 `,
    ],
    invalid: [
      {
        code: `import { cancGenAsync } from '@cancjs/coroutine/gen'; cancGenAsync(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member gen.cancGenAsync',
        code: `import * as gen from '@cancjs/coroutine/gen'; gen.cancGenAsync(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member gen.async',
        code: `import * as gen from '@cancjs/coroutine/gen'; gen.async(function* () {});`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});

describe('canc-imports: await markers', () => {
  tester.run('cancAwait', cancAwaitRule, {
    valid: [`import { cancAwait } from 'x'; cancAwait(p);`],
    invalid: [
      {
        code: `import { cancAwait } from '@cancjs/coroutine'; cancAwait(p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member canc.cancAwait',
        code: `import * as canc from '@cancjs/coroutine'; canc.cancAwait(p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member canc.await',
        code: `import * as canc from '@cancjs/coroutine'; canc.await(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('cancGenAwait', cancGenAwaitRule, {
    valid: [`import { cancGenAwait } from 'x'; cancGenAwait(p);`],
    invalid: [
      {
        code: `import { cancGenAwait } from '@cancjs/coroutine/gen'; cancGenAwait(p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member cancGen.cancGenAwait',
        code: `import * as cancGen from '@cancjs/coroutine/gen'; cancGen.cancGenAwait(p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member cancGen.await',
        code: `import * as cancGen from '@cancjs/coroutine/gen'; cancGen.await(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});

describe('canc-imports: throw helpers', () => {
  tester.run('isThrowHelperCall', throwHelperRule, {
    valid: [
      `import { cancThrow } from 'foreign'; cancThrow(new Error());`,
      `
 import { cancThrow } from '@cancjs/coroutine';
 function local() {
 function cancThrow(_e: unknown) {}
 cancThrow(new Error());
 }
 `,
      `
 import * as canc from '@cancjs/coroutine';
 function local() {
 const canc = { throw(_e: unknown) {} };
 canc.throw(new Error());
 }
 `,
    ],
    invalid: [
      {
        name: 'cancThrow named import',
        code: `import { cancThrow } from '@cancjs/coroutine'; cancThrow(new Error());`,
        errors: [{ messageId: 'canc' }],
      },
      {
        name: 'canc.throw namespace call',
        code: `import * as canc from '@cancjs/coroutine'; canc.throw(new Error());`,
        errors: [{ messageId: 'canc' }],
      },
      {
        name: 'cancGenThrow named import',
        code: `import { cancGenThrow } from '@cancjs/coroutine/gen'; cancGenThrow(new Error());`,
        errors: [{ messageId: 'cancGen' }],
      },
      {
        name: 'cancGen.throw namespace call',
        code: `import * as cancGen from '@cancjs/coroutine/gen'; cancGen.throw(new Error());`,
        errors: [{ messageId: 'cancGen' }],
      },
      {
        name: 'throw as t from coroutine/gen',
        code: `import { throw as t } from '@cancjs/coroutine/gen'; t(new Error());`,
        errors: [{ messageId: 'cancGen' }],
      },
      {
        name: 'throw as t from coroutine',
        code: `import { throw as t } from '@cancjs/coroutine'; t(new Error());`,
        errors: [{ messageId: 'canc' }],
      },
    ],
  });
});

describe('canc-imports: cancForAwait.next', () => {
  tester.run('isCancForAwaitNext', forAwaitNextRule, {
    valid: [`import { cancForAwait } from 'other'; cancForAwait.next;`, `const o = { next: 1 }; o.next;`],
    invalid: [
      {
        name: 'named cancForAwait.next',
        code: `import { cancForAwait } from '@cancjs/coroutine'; cancForAwait.next;`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace canc.forAwait.next',
        code: `import * as canc from '@cancjs/coroutine'; canc.forAwait.next;`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});

describe('canc-imports: failure and helper identifiers', () => {
  tester.run('withFailure', withFailureRule, {
    valid: [
      `import { withFailure } from 'x'; withFailure(p);`,
      `
 import { withFailure } from '@cancjs/coroutine';
 function outer(withFailure: unknown) {
 withFailure(1);
 }
 `,
    ],
    invalid: [
      {
        code: `import { withFailure } from '@cancjs/coroutine'; withFailure(p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed withFailure',
        code: `import { withFailure as wf } from '@cancjs/coroutine'; wf(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('cancGenForAwait', helperRule('cancGenForAwait'), {
    valid: [`import { cancGenForAwait } from 'x'; cancGenForAwait();`],
    invalid: [
      {
        code: `import { cancGenForAwait } from '@cancjs/coroutine/gen'; cancGenForAwait(s);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('cancGenDelegate', helperRule('cancGenDelegate'), {
    valid: [`import { cancGenDelegate } from 'x'; cancGenDelegate();`],
    invalid: [
      {
        code: `import { cancGenDelegate } from '@cancjs/coroutine/gen'; cancGenDelegate(s);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('BreakError', helperRule('BreakError'), {
    valid: [`import { BreakError } from 'x'; new BreakError();`],
    invalid: [
      {
        code: `import { BreakError } from '@cancjs/coroutine'; new BreakError();`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('isBreakError', helperRule('isBreakError'), {
    valid: [`import { isBreakError } from 'x'; isBreakError(e);`],
    invalid: [
      {
        code: `import { isBreakError } from '@cancjs/coroutine'; isBreakError(e);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('IterationError', helperRule('IterationError'), {
    valid: [`import { IterationError } from 'x'; new IterationError();`],
    invalid: [
      {
        code: `import { IterationError } from '@cancjs/coroutine'; new IterationError();`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('catchErrors', helperRule('catchErrors'), {
    valid: [`import { catchErrors } from 'x'; catchErrors(p);`],
    invalid: [
      {
        code: `import { catchErrors } from '@cancjs/toolbox'; catchErrors(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('suppressErrors', helperRule('suppressErrors'), {
    valid: [`import { suppressErrors } from 'x'; suppressErrors(p);`],
    invalid: [
      {
        code: `import { suppressErrors } from '@cancjs/toolbox'; suppressErrors(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('createIsError', helperRule('createIsError'), {
    valid: [`import { createIsError } from 'x'; createIsError('x');`],
    invalid: [
      {
        code: `import { createIsError } from '@cancjs/toolbox'; createIsError('x');`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('isErrorOf', helperRule('isErrorOf'), {
    valid: [`import { isErrorOf } from 'x'; isErrorOf(e, 'x');`],
    invalid: [
      {
        code: `import { isErrorOf } from '@cancjs/toolbox'; isErrorOf(e, 'x');`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('asyncMethod', helperRule('asyncMethod'), {
    valid: [`import { asyncMethod } from 'x'; asyncMethod();`],
    invalid: [
      {
        code: `import { asyncMethod } from '@cancjs/decorators'; asyncMethod();`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('bindMethod', helperRule('bindMethod'), {
    valid: [`import { bindMethod } from 'x'; bindMethod();`],
    invalid: [
      {
        code: `import { bindMethod } from '@cancjs/decorators'; bindMethod();`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('cancelify', helperRule('cancelify'), {
    valid: [
      `import { cancelify } from 'x'; cancelify(fn);`,
      `import { promisify } from '@cancjs/toolbox'; promisify(fn);`,
    ],
    invalid: [
      {
        code: `import { cancelify } from '@cancjs/toolbox'; cancelify(fn);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed cancelify',
        code: `import { cancelify as cf } from '@cancjs/toolbox'; cf(fn);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('createAbortSignal', helperRule('createAbortSignal'), {
    valid: [`import { createAbortSignal } from 'x'; createAbortSignal();`],
    invalid: [
      {
        code: `import { createAbortSignal } from '@cancjs/promise'; createAbortSignal();`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('cancForAwait', helperRule('cancForAwait'), {
    valid: [
      `
 import { cancForAwait } from '@cancjs/coroutine';
 function outer() {
 function cancForAwait() {}
 cancForAwait();
 }
 `,
    ],
    invalid: [
      {
        code: `import { cancForAwait } from '@cancjs/coroutine'; cancForAwait(s);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});

describe('canc-imports: default import does not match non-ctor exports', () => {
  tester.run('default import does not match lazy ctor', lazyCtorRule, {
    valid: [`import CancelablePromise from '@cancjs/promise'; new CancelablePromise(() => {});`],
    invalid: [],
  });

  tester.run('default import does not match cancAsync', coroutineRule('cancAsync'), {
    valid: [`import CancelablePromise from '@cancjs/promise'; CancelablePromise(function* () {});`],
    invalid: [],
  });

  tester.run('default import does not match cancGenAsync', coroutineRule('cancGenAsync'), {
    valid: [`import CancelablePromise from '@cancjs/promise'; CancelablePromise(function* () {});`],
    invalid: [],
  });

  tester.run('default import does not match cancAwait', cancAwaitRule, {
    valid: [`import CancelablePromise from '@cancjs/promise'; CancelablePromise(p);`],
    invalid: [],
  });

  tester.run('default import does not match cancGenAwait', cancGenAwaitRule, {
    valid: [`import CancelablePromise from '@cancjs/promise'; CancelablePromise(p);`],
    invalid: [],
  });

  tester.run('default import does not match withFailure', withFailureRule, {
    valid: [`import CancelablePromise from '@cancjs/promise'; CancelablePromise(p);`],
    invalid: [],
  });

  tester.run('default import does not match helper ident', helperRule('withFailure'), {
    valid: [`import CancelablePromise from '@cancjs/promise'; CancelablePromise(p);`],
    invalid: [],
  });
});

describe('canc-imports: promise and toolbox helpers', () => {
  tester.run('isCancelError', helperRule('isCancelError'), {
    valid: [`import { isCancelError } from 'foreign'; isCancelError(e);`],
    invalid: [
      {
        code: `import { isCancelError } from '@cancjs/promise'; isCancelError(e);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed isCancelError',
        code: `import { isCancelError as checkCancel } from '@cancjs/promise'; checkCancel(e);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('isCancPromise', helperRule('isCancPromise'), {
    valid: [`import { isCancPromise } from 'foreign'; isCancPromise(p);`],
    invalid: [
      {
        code: `import { isCancPromise } from '@cancjs/promise'; isCancPromise(p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed isCancPromise',
        code: `import { isCancPromise as checkPromise } from '@cancjs/promise'; checkPromise(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('lazy', helperRule('lazy'), {
    valid: [`import { lazy } from 'foreign'; lazy(() => p);`],
    invalid: [
      {
        code: `import { lazy } from '@cancjs/toolbox'; lazy(() => p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed lazy',
        code: `import { lazy as makeLazy } from '@cancjs/toolbox'; makeLazy(() => p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('createLazyPromise', helperRule('createLazyPromise'), {
    valid: [`import { createLazyPromise } from 'foreign'; createLazyPromise(() => p);`],
    invalid: [
      {
        code: `import { createLazyPromise } from '@cancjs/toolbox'; createLazyPromise(() => p);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'renamed createLazyPromise',
        code: `import { createLazyPromise as clp } from '@cancjs/toolbox'; clp(() => p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});

describe('canc-imports: refersTo export detection', () => {
  tester.run('refersTo isCancelError', refersToRule('isCancelError'), {
    valid: [`import { isCancelError } from 'foreign'; isCancelError(e);`],
    invalid: [
      {
        code: `import { isCancelError } from '@cancjs/promise'; isCancelError(e);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member canc.isCancelError',
        code: `import * as canc from '@cancjs/promise'; canc.isCancelError(e);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('refersTo lazy', refersToRule('lazy'), {
    valid: [`import { lazy } from 'foreign'; lazy(fn);`],
    invalid: [
      {
        code: `import { lazy } from '@cancjs/toolbox'; lazy(fn);`,
        errors: [{ messageId: 'hit' }],
      },
      {
        name: 'namespace member toolbox.lazy',
        code: `import * as tb from '@cancjs/toolbox'; tb.lazy(fn);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('refersTo createLazyPromise', refersToRule('createLazyPromise'), {
    valid: [`import { createLazyPromise } from 'foreign'; createLazyPromise(fn);`],
    invalid: [
      {
        code: `import { createLazyPromise } from '@cancjs/toolbox'; createLazyPromise(fn);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });

  tester.run('refersTo isCancPromise', refersToRule('isCancPromise'), {
    valid: [`import { isCancPromise } from 'foreign'; isCancPromise(p);`],
    invalid: [
      {
        code: `import { isCancPromise } from '@cancjs/promise'; isCancPromise(p);`,
        errors: [{ messageId: 'hit' }],
      },
    ],
  });
});
