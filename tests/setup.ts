import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import { CATALOG_RULE_IDS } from './helpers/corpus.js';

// Wire vitest equivalents ahead of RuleTester construction
RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.itSkip = it.skip;
RuleTester.describe = describe;
RuleTester.describeSkip = describe.skip;

RuleTester.setDefaultConfig({
  linterOptions: {
    reportUnusedDisableDirectives: 'off',
  },
  plugins: {
    canc: {
      rules: Object.fromEntries(CATALOG_RULE_IDS.map((id) => [id, { create: () => ({}) }])),
    },
  },
});

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
      parserOptions:
        types ?
          {
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
