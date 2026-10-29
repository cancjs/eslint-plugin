import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { Rule } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getCancServices } from '../src/util/canc-types.js';
import { corpusDir, createTypedCorpusLinter } from './helpers/typed-corpus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsconfigPath = path.resolve(__dirname, 'fixtures/corpus/tsconfig.json');

describe('typed corpus lane', () => {
  it('resolves all corpus module imports with 0 module-resolution diagnostics', () => {
    const configFile = ts.readConfigFile(tsconfigPath, (p) => ts.sys.readFile(p));
    if (configFile.error) {
      const msg =
        typeof configFile.error.messageText === 'string' ?
          configFile.error.messageText
        : configFile.error.messageText.messageText;
      throw new Error(`Failed to read tsconfig: ${msg}`);
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(tsconfigPath),
      undefined,
      tsconfigPath,
    );

    const host = ts.createCompilerHost(parsed.options);
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      host,
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    const modResCodes = new Set([2307, 2305, 2724, 2792]);
    const modResDiags = diagnostics.filter((d) => modResCodes.has(d.code));
    const otherDiags = diagnostics.filter((d) => !modResCodes.has(d.code));

    console.log(`module-resolution errors: ${modResDiags.length}`);
    console.log(`other semantic diagnostics (baseline): ${otherDiags.length}`);

    if (modResDiags.length > 0) {
      const details = modResDiags
        .map((d) => {
          const fileName = d.file ? path.relative(corpusDir, d.file.fileName) : 'unknown';
          const msg = typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText;
          return `  [TS${d.code}] ${fileName}: ${msg}`;
        })
        .join('\n');
      throw new Error(`Expected 0 module-resolution errors, got ${modResDiags.length}:\n${details}`);
    }

    expect(parsed.fileNames.length).toBe(249);
    expect(modResDiags).toHaveLength(0);
  });

  it('proves typed lane sees generated stubs via probe rule', async () => {
    let probeFound = '';

    const probeRule: TSESLint.RuleModule<'probe', []> = {
      defaultOptions: [],
      meta: {
        type: 'problem',
        docs: { description: 'probe cancelable type' },
        messages: {
          probe: 'probe: {{type}}',
        },
        schema: [],
      },
      create(context) {
        const services = getCancServices(context);
        if (!services) {
          return {};
        }

        const checker = services.program.getTypeChecker();

        return {
          VariableDeclarator(node: TSESTree.VariableDeclarator) {
            if (node.id.type === AST_NODE_TYPES.Identifier && node.id.name === 'dashboard') {
              const type = services.getTypeAtLocation(node);
              const typeString = checker.typeToString(type);
              probeFound = typeString;
              context.report({
                node,
                messageId: 'probe',
                data: { type: typeString },
              });
            }
          },
        };
      },
    };

    const linter = createTypedCorpusLinter([
      {
        plugins: {
          probe: {
            rules: {
              'type-probe': probeRule as unknown as Rule.RuleModule,
            },
          },
        },
        rules: {
          'probe/type-probe': 'error',
        },
      },
    ]);

    const candidateFile = path.resolve(corpusDir, 'flow/valid/01-cancpromise-direct-return.ts');
    const targetFile =
      existsSync(candidateFile) ? candidateFile : (
        path.resolve(corpusDir, 'flow/valid/01-no-cancelability-erasure-cancel-handle-retained.ts')
      );

    const results = await linter.lintFiles([targetFile]);
    const probeMessages = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'probe/type-probe');

    if (probeFound.includes('CancelablePromise')) {
      console.log('probe: CancelablePromise');
    }

    expect(probeMessages.length).toBeGreaterThan(0);
    expect(probeFound).toContain('CancelablePromise');
  });
});
