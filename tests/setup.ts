import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslintParser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

// Wire the full RuleTester static set to vitest equivalents before any RuleTester
// is constructed. Must happen at module load, ahead of ruleTester() calls in tests.
RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.itSkip = it.skip;
RuleTester.describe = describe;
RuleTester.describeSkip = describe.skip;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixtureProjectDir = path.join(__dirname, 'fixtures/projects/default');

export interface RuleTesterOptions {
 typeScript?: boolean;
 types?: boolean;
}

export function ruleTester({ typeScript = true, types = true }: RuleTesterOptions = {}): RuleTester {
 if (!typeScript) {
 return new RuleTester({
 languageOptions: {
 parser: undefined,
 },
 });
 }

 return new RuleTester({
 languageOptions: {
 parser: tseslintParser,
 parserOptions: types
 ? {
 projectService: {
 allowDefaultProject: ['*.ts*'],
 defaultProject: 'tsconfig.json',
 },
 tsconfigRootDir: fixtureProjectDir,
 }
 : {},
 },
 });
}
