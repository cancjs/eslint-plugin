// @ts-check
import eslintJs from '@eslint/js';
import eslintPluginEslintPlugin from 'eslint-plugin-eslint-plugin';
import format from 'eslint-plugin-format';
import eslintPluginImportX from 'eslint-plugin-import-x';
import eslintPluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
 {
 ignores: ['dist/**', 'coverage/**', 'tests/fixtures/**'],
 },

 eslintJs.configs.recommended,

 {
 files: ['**/*.ts'],
 extends: [...tseslint.configs.recommendedTypeChecked],
 languageOptions: {
 parserOptions: {
 projectService: {
 allowDefaultProject: ['*.js', '*.ts'],
 },
 tsconfigRootDir: import.meta.dirname,
 },
 },
 rules: {
 '@typescript-eslint/no-floating-promises': 'error',
 '@typescript-eslint/no-misused-promises': 'error',
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
 '@typescript-eslint/only-throw-error': 'error',
 '@typescript-eslint/return-await': 'error',
 '@typescript-eslint/prefer-optional-chain': 'warn',
 '@typescript-eslint/consistent-type-definitions': 'warn',
 '@typescript-eslint/no-confusing-non-null-assertion': 'error',
 '@typescript-eslint/no-empty-function': 'off',
 '@typescript-eslint/no-empty-object-type': [
 'error',
 { allowInterfaces: 'with-single-extends' },
 ],
 '@typescript-eslint/no-for-in-array': 'error',
 '@typescript-eslint/no-implied-eval': 'error',
 '@typescript-eslint/no-import-type-side-effects': 'error',
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
 '@typescript-eslint/prefer-function-type': 'error',
 '@typescript-eslint/prefer-reduce-type-parameter': 'warn',
 '@typescript-eslint/prefer-return-this-type': 'warn',
 '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
 },
 },

 {
 files: ['**/*.ts'],
 plugins: { format },
 rules: {
 'format/prettier': [
 'error',
 {
 parser: 'typescript',
 endOfLine: 'auto',
 singleQuote: true,
 printWidth: 100,
 singleAttributePerLine: true,
 experimentalTernaries: true,
 },
 ],
 },
 },
 {
 files: ['**/*.{js,mjs,cjs}'],
 plugins: { format },
 rules: {
 'format/prettier': [
 'error',
 {
 parser: 'babel',
 endOfLine: 'auto',
 singleQuote: true,
 printWidth: 100,
 singleAttributePerLine: true,
 experimentalTernaries: true,
 },
 ],
 },
 },
 {
 files: ['**/*.md'],
 languageOptions: { parser: format.parserPlain },
 plugins: { format },
 rules: { 'format/prettier': ['error', { printWidth: 100, parser: 'markdown' }] },
 },

 {
 plugins: {
 'simple-import-sort': eslintPluginSimpleImportSort,
 'import-x': eslintPluginImportX,
 },
 rules: {
 'simple-import-sort/imports': 'error',
 'simple-import-sort/exports': 'error',
 'import-x/first': 'error',
 'import-x/newline-after-import': 'error',
 'import-x/no-duplicates': 'error',
 },
 },

 {
 files: ['src/rules/**'],
 extends: [eslintPluginEslintPlugin.configs.recommended],
 },
);
