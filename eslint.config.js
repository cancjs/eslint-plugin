// @ts-check
// Flat config (ESLint 10). Formatting is prettier, run as an ESLint rule so there is a single
// lint entry point and a single --fix pass.
//
// Kept structurally parallel to the canc monorepo config (same block order, same comment
// headings) so the two can be diffed, and so a change to shared conventions can be applied to
// both. Differences are scope differences, not style drift: this project has no browser globals,
// resolves types through projectService rather than per-package projects, lints its own rule
// sources with eslint-plugin-eslint-plugin, and keeps the typed rules at error because there is
// no inherited type debt here.

import eslintJs from '@eslint/js';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { defineConfig, globalIgnores } from 'eslint/config';
import packageJson from 'eslint-package-json';
import prettierConfig from 'eslint-config-prettier';
import eslintPluginEslintPlugin from 'eslint-plugin-eslint-plugin';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

// Shared verbatim with the monorepo config; change them in both or in neither.
const prettierCodeOptions = {
	endOfLine: 'auto',
	singleQuote: true,
	printWidth: 120,
	singleAttributePerLine: true,
	experimentalTernaries: true,
	useTabs: true,
};

// JSON keeps spaces. npm rewrites package.json when it touches it and preserves whatever indent
// it finds, so tabs there would only invite churn.
//
// trailingComma must be none: prettier's jsonc parser would otherwise emit trailing commas that
// the json/jsonc language then refuses to parse, so the two would fight over every fixed file.
const prettierJsonOptions = {
	endOfLine: 'auto',
	useTabs: false,
	tabWidth: 2,
	trailingComma: 'none',
};

export default defineConfig(
	// Fixtures hold deliberately-bad code and are linted only through the integration harness.
	globalIgnores(['dist/**', 'coverage/**', 'tests/fixtures/**', '**/package-lock.json']),

	// Presets must stay scoped to JS/TS. Unscoped they also apply to the JSON and markdown blocks
	// below, and core rules crash on those languages' ASTs.
	{
		files: ['**/*.{ts,js,mjs,cjs}'],
		extends: [eslintJs.configs.recommended],
	},

	// TypeScript sources.
	{
		files: ['**/*.ts'],
		extends: [tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['*.js', '*.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-definitions': 'warn',
			'@typescript-eslint/no-confusing-non-null-assertion': 'error',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-for-in-array': 'error',
			'@typescript-eslint/no-implied-eval': 'error',
			'@typescript-eslint/no-import-type-side-effects': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-redundant-type-constituents': 'warn',
			'@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'warn',
			'@typescript-eslint/no-unnecessary-parameter-property-assignment': 'error',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/non-nullable-type-assertion-style': 'error',
			'@typescript-eslint/only-throw-error': 'error',
			'@typescript-eslint/prefer-function-type': 'error',
			'@typescript-eslint/prefer-optional-chain': 'warn',
			'@typescript-eslint/prefer-reduce-type-parameter': 'warn',
			'@typescript-eslint/prefer-return-this-type': 'warn',
			'@typescript-eslint/prefer-string-starts-ends-with': 'warn',
			'@typescript-eslint/return-await': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
		},
	},

	// Specs. Tests deliberately create a promise purely to assert on it later, or hold a
	// reference that is never read again.
	{
		files: ['tests/**/*.ts'],
		rules: {
			'no-useless-assignment': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'off',
		},
	},

	// Rule sources get the plugin-authoring rules on top.
	{
		files: ['src/rules/**'],
		extends: [eslintPluginEslintPlugin.configs.recommended],
	},

	// Import hygiene.
	{
		files: ['**/*.{ts,js,mjs,cjs}'],
		plugins: {
			'simple-import-sort': simpleImportSort,
			'import-x': importX,
		},
		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'import-x/first': 'error',
			'import-x/newline-after-import': 'error',
			'import-x/no-duplicates': 'error',
		},
	},

	// JSON. @eslint/json parses through the language API, which exposes real source text, so
	// prettier/prettier runs here too and one --fix pass covers both correctness and layout.
	{
		files: ['**/*.json'],
		ignores: ['**/tsconfig*.json'],
		language: 'json/json',
		extends: [json.configs.recommended],
		plugins: { prettier },
		rules: {
			'prettier/prettier': ['error', { ...prettierJsonOptions, parser: 'json' }],
		},
	},

	// tsconfig files carry comments, so they are JSONC whatever the extension says. TypeScript
	// also accepts trailing commas there, so the language has to parse them; prettier then
	// normalises them away.
	{
		files: ['**/tsconfig*.json', '**/*.jsonc', '.vscode/*.json'],
		language: 'json/jsonc',
		languageOptions: { allowTrailingCommas: true },
		extends: [json.configs.recommended],
		plugins: { prettier },
		rules: {
			'prettier/prettier': ['error', { ...prettierJsonOptions, parser: 'jsonc' }],
		},
	},

	// package.json manifests. Must come after the generic JSON block so these rules win.
	{
		files: ['**/package.json'],
		language: 'json/json',
		extends: [packageJson.configs.recommended],
		plugins: { prettier },
		rules: {
			// No CI yet, so nothing can produce provenance attestations.
			'package-json/prefer-provenance': 'off',
			// engines.npm is deliberate. This repo pins no packageManager field.
			'package-json/no-package-manager-engines': 'off',
			// devDependencies use caret by policy, but typescript and @types/node are pinned with ~
			// on purpose: typescript-eslint only supports typescript below 6.1, and the node types
			// track one chosen line. package.json takes no comments, so there is nowhere to put an
			// inline exemption for those two lines.
			'package-json/dependency-version-range': 'off',
			// The import and require conditions are exhaustive and each carries its own types, so a
			// top-level default fallback would only hide a genuinely missing condition.
			'package-json/require-default-condition': 'off',

			// Real gaps in a manifest that is still scaffolding. They need content decisions, so
			// they stay visible as warnings rather than blocking a lint run.
			'package-json/require-fields': 'warn',
			'package-json/prefer-files-field': 'warn',
			'package-json/prefer-side-effects-field': 'warn',

			'prettier/prettier': ['error', { ...prettierJsonOptions, parser: 'json' }],
		},
	},

	// Markdown. proseWrap stays at its default (preserve), so prose is never rewrapped; this only
	// normalises list markers, headings, fences and tables.
	{
		files: ['**/*.md'],
		language: 'markdown/gfm',
		plugins: { markdown, prettier },
		rules: {
			'prettier/prettier': ['error', { endOfLine: 'auto', parser: 'markdown' }],
		},
	},

	// Code formatting. eslint-config-prettier first switches off every layout rule the presets
	// enable, then prettier owns layout outright.
	{
		files: ['**/*.{ts,js,mjs,cjs}'],
		extends: [prettierConfig],
		plugins: { prettier },
		rules: {
			'prettier/prettier': ['error', prettierCodeOptions],
		},
	},
);
