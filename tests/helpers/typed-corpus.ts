import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tseslintParser from '@typescript-eslint/parser';
import { ESLint, type Linter } from 'eslint';

import plugin from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const corpusDir = path.resolve(__dirname, '../fixtures/corpus');

export function createTypedCorpusLinter(overrideConfig?: Linter.Config[]): ESLint {
  return new ESLint({
    cwd: corpusDir,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslintParser,
          parserOptions: {
            projectService: true,
            tsconfigRootDir: corpusDir,
          },
        },
        plugins: { canc: plugin },
      },
      ...(overrideConfig ?? []),
    ],
  });
}
