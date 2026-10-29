import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, 'fixtures/corpus');
const failureDir = path.resolve(corpusDir, 'failure');
const tsconfigPath = path.resolve(corpusDir, 'tsconfig.json');

describe('failure-corpus-typecheck', () => {
  it('typechecks all failure corpus files with zero unexpected semantic diagnostics', () => {
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

    const validDir = path.resolve(failureDir, 'valid');
    const invalidDir = path.resolve(failureDir, 'invalid');

    const validFiles = fs
      .readdirSync(validDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.resolve(validDir, f));

    const invalidFiles = fs
      .readdirSync(invalidDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.resolve(invalidDir, f));

    const allFiles = [...validFiles, ...invalidFiles];
    const totalFiles = allFiles.length;

    console.log(
      `Checked ${totalFiles} failure corpus files (${validFiles.length} valid, ${invalidFiles.length} invalid)`,
    );

    expect(totalFiles).toBeGreaterThan(25);

    const host = ts.createCompilerHost(parsed.options);
    const program = ts.createProgram({
      rootNames: allFiles,
      options: parsed.options,
      host,
    });

    const unexpectedErrors: string[] = [];

    for (const filePath of allFiles) {
      const fileName = path.basename(filePath);
      const sf = program.getSourceFile(filePath);
      if (!sf) {
        unexpectedErrors.push(`Could not find source file in program: ${filePath}`);
        continue;
      }

      const diagnostics = ts.getPreEmitDiagnostics(program, sf);

      if (fileName.includes('tail-position')) {
        // Deliberate defect: bare yield* cancThrow does not return, triggering TS2355
        const codes = diagnostics.map((d) => d.code);
        expect(codes).toContain(2355);
        const unexpectedTailDiags = diagnostics.filter((d) => d.code !== 2355);
        if (unexpectedTailDiags.length > 0) {
          for (const d of unexpectedTailDiags) {
            const msg = typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText;
            unexpectedErrors.push(`[TS${d.code}] ${fileName}: ${msg}`);
          }
        }
      } else {
        for (const d of diagnostics) {
          const msg = typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText;
          unexpectedErrors.push(`[TS${d.code}] ${fileName}: ${msg}`);
        }
      }
    }

    if (unexpectedErrors.length > 0) {
      throw new Error(
        `Unexpected semantic diagnostics in failure corpus (${unexpectedErrors.length}):\n${unexpectedErrors.join('\n')}`,
      );
    }

    expect(unexpectedErrors).toHaveLength(0);
  });
});
