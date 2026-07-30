import tseslintParser from '@typescript-eslint/parser';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
import { describe, expect, it } from 'vitest';

import {
	type CancBinding,
	type CoroutineFn,
	getCancBindings,
	isAwaitedIdent,
	isCancAwaitIdent,
	isCancCtorIdent,
	isCancIterAwaitIdent,
	isCoroutineFnIdent,
	isHelperIdent,
} from '../src/util/canc-imports.js';
import { ruleTester } from './setup.js';

const tester = ruleTester({ types: false });

type Ctx = TSESLint.RuleContext<'hit', unknown[]>;

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
const cancIterAwaitRule = probeRule((node, ctx) => isCancIterAwaitIdent(node, ctx));
const awaitedRule = probeRule((node, ctx) => isAwaitedIdent(node, ctx));
const coroutineRule = (which: CoroutineFn) => probeRule((node, ctx) => isCoroutineFnIdent(node, ctx, which));
const helperRule = (name: string) => probeRule((node, ctx) => isHelperIdent(node, ctx, name));

describe('canc-imports: getCancBindings', () => {
	// Snapshot the binding map for a given source by running a rule that captures
	// it in a Program handler, driven through a real Linter.
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
			// non-canc source
			`import { CancelablePromise } from 'bluebird'; new CancelablePromise(() => {});`,
			// shadowed by local class -> must NOT match (scope handling)
			`
 import { CancelablePromise } from '@cancjs/promise';
 function f() {
 class CancelablePromise {}
 new CancelablePromise();
 }
 `,
			// shadowed by local param
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
			{
				name: 'native subpath',
				code: `import { CancelablePromise } from '@cancjs/promise/native'; new CancelablePromise(() => {});`,
				errors: [{ messageId: 'hit' }],
			},
		],
	});
});

describe('canc-imports: isCoroutineFnIdent', () => {
	tester.run('cancAsync', coroutineRule('cancAsync'), {
		valid: [
			`import { cancAsync } from 'other'; cancAsync(function* () {});`,
			// namespace member of a DIFFERENT namespace-like local var (not canc)
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
				name: 'require namespace member',
				code: `const co = require('@cancjs/coroutine'); co.cancAsync(function* () {});`,
				errors: [{ messageId: 'hit' }],
			},
		],
	});

	tester.run('cancIterAsync', coroutineRule('cancIterAsync'), {
		valid: [`import { cancIterAsync } from 'x'; cancIterAsync();`],
		invalid: [
			{
				code: `import { cancIterAsync } from '@cancjs/coroutine/iter'; cancIterAsync(function* () {});`,
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
		],
	});

	tester.run('cancIterAwait', cancIterAwaitRule, {
		valid: [`import { cancIterAwait } from 'x'; cancIterAwait(p);`],
		invalid: [
			{
				code: `import { cancIterAwait } from '@cancjs/coroutine/iter'; cancIterAwait(p);`,
				errors: [{ messageId: 'hit' }],
			},
		],
	});

	tester.run('awaited', awaitedRule, {
		valid: [`import { awaited } from 'x'; awaited(p);`],
		invalid: [
			{
				code: `import { awaited } from '@cancjs/coroutine/iter'; awaited(p);`,
				errors: [{ messageId: 'hit' }],
			},
		],
	});
});

describe('canc-imports: isHelperIdent', () => {
	tester.run('cancelify', helperRule('cancelify'), {
		valid: [
			`import { cancelify } from 'x'; cancelify(fn);`,
			// wrong helper name requested
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
			// shadowed by a local function declaration -> scope wins, not a match
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
