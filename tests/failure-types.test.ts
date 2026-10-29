import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import { getFailureMembers, isCancelErrorType } from '../src/util/failure-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureTsconfigPath = path.resolve(__dirname, 'fixtures/projects/default/tsconfig.json');

function getTypeByName(sourceFile: ts.SourceFile, checker: ts.TypeChecker, name: string): ts.Type {
  for (const stmt of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name) {
      return checker.getTypeAtLocation(stmt);
    }
    if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) {
      return checker.getTypeAtLocation(stmt);
    }
  }
  throw new Error(`Symbol ${name} not found in ${sourceFile.fileName}`);
}

describe('failure-types', () => {
  let checker: ts.TypeChecker;
  let casesFile: ts.SourceFile;
  let copyAFile: ts.SourceFile;
  let copyBFile: ts.SourceFile;

  beforeAll(() => {
    const configFile = ts.readConfigFile(fixtureTsconfigPath, (p) => ts.sys.readFile(p));
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(fixtureTsconfigPath),
      undefined,
      fixtureTsconfigPath,
    );

    const program = ts.createProgram(parsed.fileNames, parsed.options);
    checker = program.getTypeChecker();

    const casesPath = path.resolve(path.dirname(fixtureTsconfigPath), 'src/failure-test-cases.ts');
    const copyAPath = path.resolve(path.dirname(fixtureTsconfigPath), 'src/failure-copy-a.ts');
    const copyBPath = path.resolve(path.dirname(fixtureTsconfigPath), 'src/failure-copy-b.ts');

    casesFile = program.getSourceFile(casesPath)!;
    copyAFile = program.getSourceFile(copyAPath)!;
    copyBFile = program.getSourceFile(copyBPath)!;

    if (!casesFile || !copyAFile || !copyBFile) {
      throw new Error('Failed to find fixture source files in ts.Program');
    }
  });

  describe('getFailureMembers', () => {
    it('CancelablePromise<T, Foo> listed=[Foo] open=false defined=true', () => {
      const type = getTypeByName(casesFile, checker, 'CaseFoo');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(true);
      expect(res.open).toBe(false);
      expect(res.listed.map((t) => checker.typeToString(t))).toEqual(['FooError']);
    });

    it('<T, Foo | Unlisted> listed=[Foo] open=true defined=true', () => {
      const type = getTypeByName(casesFile, checker, 'CaseFooOpen');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(true);
      expect(res.open).toBe(true);
      expect(res.listed.map((t) => checker.typeToString(t))).toEqual(['FooError']);
    });

    it('<T> defined=false open=false listed=[]', () => {
      const type = getTypeByName(casesFile, checker, 'CaseDefault');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(false);
      expect(res.open).toBe(false);
      expect(res.listed).toEqual([]);
    });

    it('<T, any> defined=false open=false listed=[]', () => {
      const type = getTypeByName(casesFile, checker, 'CaseAny');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(false);
      expect(res.open).toBe(false);
      expect(res.listed).toEqual([]);
    });

    it('<T, never> defined=true open=false listed=[]', () => {
      const type = getTypeByName(casesFile, checker, 'CaseNever');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(true);
      expect(res.open).toBe(false);
      expect(res.listed).toEqual([]);
    });
  });

  describe('isCancelErrorType', () => {
    it('subclass of CancelError and CancelError & {x:1} -> isCancelErrorType true; plain Error false', () => {
      const sub = getTypeByName(casesFile, checker, 'SubCancelError');
      const inter = getTypeByName(casesFile, checker, 'InterCancelError');
      const plain = getTypeByName(casesFile, checker, 'PlainError');

      expect(isCancelErrorType(sub, checker)).toBe(true);
      expect(isCancelErrorType(inter, checker)).toBe(true);
      expect(isCancelErrorType(plain, checker)).toBe(false);
    });

    it('duplicate-copy probe: two fixture files each declaring structurally identical CancelError-branded class -> both true', () => {
      const copyA = getTypeByName(copyAFile, checker, 'DuplicateCancelErrorA');
      const copyB = getTypeByName(copyBFile, checker, 'DuplicateCancelErrorB');

      expect(isCancelErrorType(copyA, checker)).toBe(true);
      expect(isCancelErrorType(copyB, checker)).toBe(true);
    });
  });
});
