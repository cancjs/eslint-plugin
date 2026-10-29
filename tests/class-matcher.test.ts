import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { compileMatchers, compileOptions, isIncluded, matchesName, matchesType } from '../src/util/class-matcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureTsconfigPath = path.resolve(__dirname, 'fixtures/projects/default/tsconfig.json');

function createFixtureProgram(sourceCode: string): {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
} {
  const configFile = ts.readConfigFile(fixtureTsconfigPath, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(fixtureTsconfigPath),
    undefined,
    fixtureTsconfigPath,
  );

  const testFileName = path.resolve(path.dirname(fixtureTsconfigPath), 'src/temp-test-class-matcher.ts');

  const host = ts.createCompilerHost(parsed.options);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (path.resolve(fileName) === testFileName) {
      return ts.createSourceFile(fileName, sourceCode, languageVersion, true);
    }
    return defaultGetSourceFile.call(host, fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram({
    rootNames: [...parsed.fileNames, testFileName],
    options: parsed.options,
    host,
  });

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(testFileName)!;
  return { program, checker, sourceFile };
}

function findClassType(sourceFile: ts.SourceFile, checker: ts.TypeChecker, className: string): ts.Type {
  let found: ts.Type | undefined;
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = checker.getTypeAtLocation(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error(`Could not find class ${className} in source file`);
  return found;
}

function findVariableType(sourceFile: ts.SourceFile, checker: ts.TypeChecker, varName: string): ts.Type {
  let found: ts.Type | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === varName) {
      found = checker.getTypeAtLocation(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error(`Could not find variable ${varName} in source file`);
  return found;
}

describe('class-matcher util', () => {
  it('throws a clear Error on invalid regex or g/y flags naming the pattern', () => {
    expect(() => compileMatchers(['/x/g'])).toThrow(/flag 'g' is not permitted/);
    expect(() => compileMatchers(['/x/y'])).toThrow(/flag 'y' is not permitted/);
    expect(() => compileMatchers(['/(/'])).toThrow(/Invalid regex matcher "\/\(\/"/);
    expect(() => compileMatchers([{ extends: '/[invalid/g' }])).toThrow(/flag 'g' is not permitted/);
  });

  it('matches syntactic class names via matchesName', () => {
    const compiled = compileMatchers(['Error', '/^Assert/u']);
    expect(matchesName(compiled, 'Error')).toBe(true);
    expect(matchesName(compiled, 'AssertionError')).toBe(true);
    expect(matchesName(compiled, 'AssertFailure')).toBe(true);
    expect(matchesName(compiled, 'TypeError')).toBe(false);
  });

  it('evaluates isIncluded syntactically when type info is absent', () => {
    const opts = compileOptions({
      include: ['/^Assert/u', 'CustomError'],
      exclude: ['AssertIgnored'],
    });

    expect(isIncluded(opts, { name: 'AssertSuccess' })).toBe(true);
    expect(isIncluded(opts, { name: 'CustomError' })).toBe(true);
    expect(isIncluded(opts, { name: 'AssertIgnored' })).toBe(false); // exclude beats include
    expect(isIncluded(opts, { name: 'OtherError' })).toBe(false);

    // Empty include = all
    const optsNoInclude = compileOptions({ exclude: ['BadError'] });
    expect(isIncluded(optsNoInclude, { name: 'GoodError' })).toBe(true);
    expect(isIncluded(optsNoInclude, { name: 'BadError' })).toBe(false);
  });

  it('handles typed matching with exact name, regex, lib specifier, and extends', () => {
    const code = `
      import { CancelError as PkgCancelError } from '@cancjs/promise';

      export class MyError extends Error {}
      export class Level2Error extends MyError {}
      export class CancelError {}
      export class UnrelatedClass {}

      export const stdError = new Error();
      export const pkgCancelError = new PkgCancelError();
    `;

    const { program, checker, sourceFile } = createFixtureProgram(code);

    const myErrorType = findClassType(sourceFile, checker, 'MyError');
    const level2Type = findClassType(sourceFile, checker, 'Level2Error');
    const localCancelErrorType = findClassType(sourceFile, checker, 'CancelError');
    const unrelatedType = findClassType(sourceFile, checker, 'UnrelatedClass');
    const stdErrorType = findVariableType(sourceFile, checker, 'stdError');
    const pkgCancelErrorType = findVariableType(sourceFile, checker, 'pkgCancelError');

    // 1. { from: 'lib', name: 'Error' } vs MyError (no match) and vs Error (match)
    const libErrorMatcher = compileMatchers([{ from: 'lib', name: 'Error' }]);
    expect(matchesType(libErrorMatcher, myErrorType, checker, program)).toBe(false);
    expect(matchesType(libErrorMatcher, level2Type, checker, program)).toBe(false);
    expect(matchesType(libErrorMatcher, stdErrorType, checker, program)).toBe(true);

    // 2. { extends: 'Error' } matches MyError and Level2Error (transitive)
    const extendsErrorMatcher = compileMatchers([{ extends: 'Error' }]);
    expect(matchesType(extendsErrorMatcher, myErrorType, checker, program)).toBe(true);
    expect(matchesType(extendsErrorMatcher, level2Type, checker, program)).toBe(true);
    expect(matchesType(extendsErrorMatcher, unrelatedType, checker, program)).toBe(false);

    // 3. Regex matching: '/^My/'
    const regexMatcher = compileMatchers(['/^My/']);
    expect(matchesType(regexMatcher, myErrorType, checker, program)).toBe(true);
    expect(matchesType(regexMatcher, level2Type, checker, program)).toBe(false);

    // 4. Same-named user class CancelError vs { from: 'package', package: '@cancjs/promise', name: 'CancelError' }
    const packageMatcher = compileMatchers([{ from: 'package', package: '@cancjs/promise', name: 'CancelError' }]);
    expect(matchesType(packageMatcher, localCancelErrorType, checker, program)).toBe(false);
    expect(matchesType(packageMatcher, pkgCancelErrorType, checker, program)).toBe(true);

    // 5. isIncluded: exclude beats include on typed subjects
    const complexOpts = compileOptions({
      include: [{ extends: 'Error' }],
      exclude: ['Level2Error'],
    });

    expect(isIncluded(complexOpts, { type: myErrorType }, checker, program)).toBe(true);
    expect(isIncluded(complexOpts, { type: level2Type, name: 'Level2Error' }, checker, program)).toBe(false);
    expect(isIncluded(complexOpts, { type: unrelatedType }, checker, program)).toBe(false);
  });
});
