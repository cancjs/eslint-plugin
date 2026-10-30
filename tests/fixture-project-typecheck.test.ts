import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, 'fixtures/projects/default');
const tsconfigPath = path.join(projectDir, 'tsconfig.json');
const probePath = path.join(projectDir, 'src/default-import-probe.ts');

const PROBE_SOURCE = `import CP from '@cancjs/promise';

export const probe: CP<number, Error> = CP.resolve(1);
`;

function typecheckProject(extraFiles: Record<string, string>): string[] {
  const configFile = ts.readConfigFile(tsconfigPath, (p) => ts.sys.readFile(p));
  expect(configFile.error).toBeUndefined();

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectDir);
  const host = ts.createCompilerHost(parsed.options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (f) => path.resolve(f) in extraFiles || fileExists(f);
  host.readFile = (f) => extraFiles[path.resolve(f)] ?? readFile(f);
  host.getSourceFile = (f, languageVersion, ...rest) => {
    const text = extraFiles[path.resolve(f)];
    return text === undefined ?
        getSourceFile(f, languageVersion, ...rest)
      : ts.createSourceFile(f, text, languageVersion);
  };

  const program = ts.createProgram({
    rootNames: [...parsed.fileNames, ...Object.keys(extraFiles)],
    options: parsed.options,
    host,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (d) =>
        `${d.file ? path.basename(d.file.fileName) : ''}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
    );
}

describe('fixture-project-typecheck', () => {
  it('typechecks the default fixture project with zero diagnostics', () => {
    expect(typecheckProject({})).toEqual([]);
  });

  it('resolves the default import of the promise stub to the class, not a namespace', () => {
    expect(typecheckProject({ [probePath]: PROBE_SOURCE })).toEqual([]);
  });
});
