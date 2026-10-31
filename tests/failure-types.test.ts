import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  getFailureMembers,
  getProgramFailureSymbols,
  isCancelErrorCtorNode,
  isCancelErrorType,
  isUnlistedMarker,
} from '../src/util/failure-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureTsconfigPath = path.resolve(__dirname, 'fixtures/projects/default/tsconfig.json');

function getTypeByName(sourceFile: ts.SourceFile, checker: ts.TypeChecker, name: string): ts.Type {
  for (const stmt of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name) {
      return checker.getTypeAtLocation(stmt);
    }
    if ((ts.isClassDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) && stmt.name?.text === name) {
      return checker.getTypeAtLocation(stmt);
    }
  }
  throw new Error(`Symbol ${name} not found in ${sourceFile.fileName}`);
}

function getClassSymbol(sourceFile: ts.SourceFile, checker: ts.TypeChecker, name: string): ts.Symbol {
  const type = getTypeByName(sourceFile, checker, name);
  const symbol = type.getSymbol();
  if (!symbol) {
    throw new Error(`Class ${name} has no symbol`);
  }
  return symbol;
}

function createVirtualProgram(files: Record<string, string>): { program: ts.Program; dir: string } {
  const dir = path.dirname(fixtureTsconfigPath);
  const configFile = ts.readConfigFile(fixtureTsconfigPath, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dir, undefined, fixtureTsconfigPath);
  const virtual = new Map<string, string>();
  for (const [name, text] of Object.entries(files)) {
    virtual.set(path.resolve(dir, 'src', name).replaceAll('\\', '/'), text);
  }
  const host = ts.createCompilerHost(parsed.options);
  const key = (f: string) => path.resolve(f).replaceAll('\\', '/');
  const origRead = host.readFile.bind(host);
  const origExists = host.fileExists.bind(host);
  const origGet = host.getSourceFile.bind(host);
  host.readFile = (f) => virtual.get(key(f)) ?? origRead(f);
  host.fileExists = (f) => virtual.has(key(f)) || origExists(f);
  host.getSourceFile = (f, lang, onError, shouldCreate) => {
    const text = virtual.get(key(f));
    return text === undefined ? origGet(f, lang, onError, shouldCreate) : ts.createSourceFile(f, text, lang);
  };
  const roots = [...virtual.keys(), path.resolve(dir, 'src/failure-test-cases.ts')];
  return { program: ts.createProgram(roots, parsed.options, host), dir };
}

const defaultSettings = {
  sources: ['@cancjs/promise', '@cancjs/coroutine', '@cancjs/toolbox'],
  cancelableTypeNames: ['CancelablePromise'],
  lazyTypeNames: ['LazyPromise'],
  structuralDetection: true,
  boundaryFunctions: [],
};

describe('failure-types', () => {
  let checker: ts.TypeChecker;
  let casesFile: ts.SourceFile;
  let copyAFile: ts.SourceFile;
  let copyBFile: ts.SourceFile;
  let program: ts.Program;
  let userFile: ts.SourceFile;
  let mixedFile: ts.SourceFile;
  let lookalikeFile: ts.SourceFile;
  let realFile: ts.SourceFile;

  beforeAll(() => {
    const configFile = ts.readConfigFile(fixtureTsconfigPath, (p) => ts.sys.readFile(p));
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(fixtureTsconfigPath),
      undefined,
      fixtureTsconfigPath,
    );

    program = ts.createProgram(parsed.fileNames, parsed.options);
    checker = program.getTypeChecker();

    const casesPath = path.resolve(path.dirname(fixtureTsconfigPath), 'src/failure-test-cases.ts');
    const copyAPath = path.resolve(path.dirname(fixtureTsconfigPath), 'src/failure-copy-a.ts');
    const copyBPath = path.resolve(path.dirname(fixtureTsconfigPath), 'src/failure-copy-b.ts');

    casesFile = program.getSourceFile(casesPath)!;
    copyAFile = program.getSourceFile(copyAPath)!;
    copyBFile = program.getSourceFile(copyBPath)!;

    const srcDir = path.resolve(path.dirname(fixtureTsconfigPath), 'src');
    userFile = program.getSourceFile(path.resolve(srcDir, 'failure-user-carriers.ts'))!;
    mixedFile = program.getSourceFile(path.resolve(srcDir, 'failure-mixed-unions.ts'))!;
    lookalikeFile = program.getSourceFile(path.resolve(srcDir, 'failure-lookalikes.ts'))!;
    realFile = program.getSourceFile(path.resolve(srcDir, 'failure-real-usage.ts'))!;

    if (!casesFile || !copyAFile || !copyBFile || !userFile || !mixedFile || !lookalikeFile || !realFile) {
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

  describe('getFailureMembers carrier gate', () => {
    it('a user-declared FAILURE symbol is not a failure carrier', () => {
      const type = getTypeByName(userFile, checker, 'UserSymbolCarrier');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(false);
      expect(res.listed).toEqual([]);
    });

    it('a local CancelablePromise class with a FAILURE member is not a failure carrier', () => {
      const type = getTypeByName(userFile, checker, 'LocalNamedCarrier');
      const res = getFailureMembers(type, checker);
      expect(res.defined).toBe(false);
      expect(res.listed).toEqual([]);
    });

    it('a union with a non-carrier object branch is not defined', () => {
      const res = getFailureMembers(getTypeByName(mixedFile, checker, 'MixedWithObject'), checker);
      expect(res.defined).toBe(false);
      expect(res.listed.map((t) => checker.typeToString(t))).toEqual(['FooError']);
    });

    it('a union with a primitive branch is not defined', () => {
      const res = getFailureMembers(getTypeByName(mixedFile, checker, 'MixedWithString'), checker);
      expect(res.defined).toBe(false);
    });

    it('a union of carriers merges the listed failures', () => {
      const res = getFailureMembers(getTypeByName(mixedFile, checker, 'CarrierUnion'), checker);
      expect(res.defined).toBe(true);
      expect(res.listed.map((t) => checker.typeToString(t)).sort()).toEqual(['BarError', 'FooError']);
    });

    it('an undefined branch beside a carrier stays defined', () => {
      const res = getFailureMembers(getTypeByName(mixedFile, checker, 'CarrierOrUndefined'), checker);
      expect(res.defined).toBe(true);
      expect(res.listed.map((t) => checker.typeToString(t))).toEqual(['FooError']);
    });
  });

  describe('getFailureMembers carrier sub-gates', () => {
    const files = {
      'b3-carrier.ts': `import type { CancelablePromise, FAILURE } from '@cancjs/promise';
import { FooError } from './failure-test-cases.js';
export type CancSymbolOnNonCarrier = Pick<CancelablePromise<string, FooError>, typeof FAILURE>;
`,
      'b3-symbol.ts': `import type { CancelError } from '@cancjs/promise';
import { FooError } from './failure-test-cases.js';
declare const FAILURE: unique symbol;
export interface CarrierWithUserSymbol extends CancelError { readonly [FAILURE]?: FooError }
`,
      'b3-union.ts': `import type { CancelablePromise } from '@cancjs/promise';
import { FooError } from './failure-test-cases.js';
export type CarrierOrObject = CancelablePromise<string, FooError> | { z: 1 };
`,
      'b3-unlisted.ts': `import type { CancelablePromise } from '@cancjs/promise';
import { FooError } from './failure-test-cases.js';
export class Unlisted { readonly note = 1; }
export type UserUnlisted = Unlisted;
export type RealUnlisted = CancelablePromise<number, Unlisted>;
export interface UnlistedCopy { readonly _cancUnlisted: true }
export interface UnlistedWrongLiteral { readonly _cancUnlisted: false }
export type CopyOpen = CancelablePromise<number, Unlisted | UnlistedCopy>;
export type IntersectionOpen = CancelablePromise<number, Unlisted & UnlistedCopy>;
export type OrNull = CancelablePromise<string, FooError> | null;
`,
    };
    let virtualProgram: ts.Program;
    let virtualChecker: ts.TypeChecker;

    function virtualType(file: string, name: string): ts.Type {
      const sf = virtualProgram.getSourceFile(path.resolve(path.dirname(fixtureTsconfigPath), 'src', file))!;
      return getTypeByName(sf, virtualChecker, name);
    }

    beforeAll(() => {
      virtualProgram = createVirtualProgram(files).program;
      virtualChecker = virtualProgram.getTypeChecker();
    });

    it('carrier gate: a non-carrier type holding the canc FAILURE symbol is not defined', () => {
      const res = getFailureMembers(virtualType('b3-carrier.ts', 'CancSymbolOnNonCarrier'), virtualChecker);
      expect(res.defined).toBe(false);
      expect(res.listed).toEqual([]);
    });

    it('symbol match: a carrier whose FAILURE symbol is user-declared is not defined', () => {
      const res = getFailureMembers(virtualType('b3-symbol.ts', 'CarrierWithUserSymbol'), virtualChecker);
      expect(res.defined).toBe(false);
      expect(res.listed).toEqual([]);
    });

    it('union every-branch: a carrier beside a non-carrier object stays not defined', () => {
      const res = getFailureMembers(virtualType('b3-union.ts', 'CarrierOrObject'), virtualChecker);
      expect(res.defined).toBe(false);
      expect(res.listed.map((t) => virtualChecker.typeToString(t))).toEqual(['FooError']);
    });

    it('a user class named Unlisted is not the open-set marker', () => {
      expect(isUnlistedMarker(virtualType('b3-unlisted.ts', 'UserUnlisted'), virtualChecker)).toBe(false);
      const res = getFailureMembers(virtualType('b3-unlisted.ts', 'RealUnlisted'), virtualChecker);
      expect(res.open).toBe(false);
      expect(res.listed.map((t) => virtualChecker.typeToString(t))).toEqual(['Unlisted']);
    });

    it('a structural copy with a literal true _cancUnlisted member is the open-set marker', () => {
      expect(isUnlistedMarker(virtualType('b3-unlisted.ts', 'UnlistedCopy'), virtualChecker)).toBe(true);
      expect(isUnlistedMarker(virtualType('b3-unlisted.ts', 'UnlistedWrongLiteral'), virtualChecker)).toBe(false);
      const res = getFailureMembers(virtualType('b3-unlisted.ts', 'CopyOpen'), virtualChecker);
      expect(res.open).toBe(true);
      expect(res.listed.map((t) => virtualChecker.typeToString(t))).toEqual(['Unlisted']);
    });

    it('marker on an intersection keeps the other constituent and sets open true', () => {
      const res = getFailureMembers(virtualType('b3-unlisted.ts', 'IntersectionOpen'), virtualChecker);
      expect(res.open).toBe(true);
      expect(res.listed.map((t) => virtualChecker.typeToString(t))).toEqual(['Unlisted']);
    });

    it('union filter: a null branch does not make a carrier union undefined', () => {
      const res = getFailureMembers(virtualType('b3-unlisted.ts', 'OrNull'), virtualChecker);
      expect(res.defined).toBe(true);
      expect(res.listed.map((t) => virtualChecker.typeToString(t))).toEqual(['FooError']);
    });
  });

  describe('getProgramFailureSymbols', () => {
    it('ignores failure positions declared by look-alike CancelablePromise, withFailure, isErrorOf, cancThrow and fail', () => {
      const symbols = getProgramFailureSymbols(program, checker, defaultSettings);
      for (const name of [
        'LookTypeArgError',
        'LookWithFailureError',
        'LookIsErrorOfError',
        'LookThrowError',
        'LookFailError',
      ]) {
        expect(symbols.has(getClassSymbol(lookalikeFile, checker, name)), name).toBe(false);
      }
    });

    it('collects failure positions declared by the tracked canc packages', () => {
      const symbols = getProgramFailureSymbols(program, checker, defaultSettings);
      for (const name of [
        'RealTypeArgError',
        'RealWithFailureError',
        'RealIsErrorOfError',
        'RealThrowError',
        'RealFailError',
      ]) {
        expect(symbols.has(getClassSymbol(realFile, checker, name)), name).toBe(true);
      }
    });

    it('does not reuse a result computed for different settings on the same program', () => {
      const restricted = {
        ...defaultSettings,
        sources: ['@cancjs/toolbox'],
        structuralDetection: false,
      };
      const fewer = getProgramFailureSymbols(program, checker, restricted);
      const full = getProgramFailureSymbols(program, checker, defaultSettings);
      const typeArgError = getClassSymbol(realFile, checker, 'RealTypeArgError');
      expect(fewer.has(typeArgError)).toBe(false);
      expect(full.has(typeArgError)).toBe(true);
    });

    it('returns a different result for structural detection on one program, nominal call first', () => {
      const { program: probeProgram, dir } = createVirtualProgram({
        'cache-probe.ts': `export class ProbeError extends Error {}
declare class CancelablePromise<T, E = unknown> {
  then(onfulfilled?: (value: T) => unknown): unknown;
  cancel(): void;
  readonly failure?: E;
}
export declare function typed(): CancelablePromise<void, ProbeError>;
`,
      });
      const probeChecker = probeProgram.getTypeChecker();
      const probeFile = probeProgram.getSourceFile(path.resolve(dir, 'src', 'cache-probe.ts'))!;
      const probeError = getClassSymbol(probeFile, probeChecker, 'ProbeError');
      const nominal = getProgramFailureSymbols(probeProgram, probeChecker, {
        ...defaultSettings,
        structuralDetection: false,
      });
      const structural = getProgramFailureSymbols(probeProgram, probeChecker, defaultSettings);
      expect(nominal.has(probeError)).toBe(false);
      expect(structural.has(probeError)).toBe(true);
    });

    it('keys the cache on structuralDetection alone', () => {
      const structural = getProgramFailureSymbols(program, checker, defaultSettings);
      const nominal = getProgramFailureSymbols(program, checker, { ...defaultSettings, structuralDetection: false });
      const nominalAgain = getProgramFailureSymbols(program, checker, {
        ...defaultSettings,
        structuralDetection: false,
      });
      expect(nominal).not.toBe(structural);
      expect(nominalAgain).toBe(nominal);
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

    it('matches the brand key exactly, not by substring', () => {
      for (const name of ['SubstringBrandError', 'LocalNamedSymbolError', 'StringKeyedBrandError']) {
        expect(isCancelErrorType(getTypeByName(userFile, checker, name), checker), name).toBe(false);
      }
    });

    it('duplicate-copy probe: two fixture files each declaring structurally identical CancelError-branded class -> both true', () => {
      const copyA = getTypeByName(copyAFile, checker, 'DuplicateCancelErrorA');
      const copyB = getTypeByName(copyBFile, checker, 'DuplicateCancelErrorB');

      expect(isCancelErrorType(copyA, checker)).toBe(true);
      expect(isCancelErrorType(copyB, checker)).toBe(true);
    });
  });

  describe('isUnlistedMarker', () => {
    it('recognizes Unlisted marker type and rejects plain error types', () => {
      const unlisted = getTypeByName(casesFile, checker, 'CaseUnlisted');
      const plain = getTypeByName(casesFile, checker, 'PlainError');

      expect(isUnlistedMarker(unlisted, checker)).toBe(true);
      expect(isUnlistedMarker(plain, checker)).toBe(false);
    });
  });

  describe('isCancelErrorCtorNode', () => {
    it('returns true for NewExpression referring to CancelError and false for other callees', () => {
      const mockContext = {
        sourceCode: {
          ast: {
            body: [
              {
                type: AST_NODE_TYPES.ImportDeclaration,
                source: { value: '@cancjs/promise' },
                specifiers: [
                  {
                    type: AST_NODE_TYPES.ImportSpecifier,
                    imported: { type: AST_NODE_TYPES.Identifier, name: 'CancelError' },
                    local: { type: AST_NODE_TYPES.Identifier, name: 'CancelError' },
                  },
                ],
              },
            ],
          },
          getScope: () => ({
            set: new Map(),
            variables: [],
            upper: null,
          }),
        },
        settings: {},
      } as unknown as TSESLint.RuleContext<string, readonly unknown[]>;

      const cancelErrorNode = {
        type: AST_NODE_TYPES.NewExpression,
        callee: {
          type: AST_NODE_TYPES.Identifier,
          name: 'CancelError',
        },
        arguments: [],
      } as unknown as TSESTree.Node;

      const otherNode = {
        type: AST_NODE_TYPES.NewExpression,
        callee: {
          type: AST_NODE_TYPES.Identifier,
          name: 'Error',
        },
        arguments: [],
      } as unknown as TSESTree.Node;

      expect(isCancelErrorCtorNode(cancelErrorNode, mockContext)).toBe(true);
      expect(isCancelErrorCtorNode(otherNode, mockContext)).toBe(false);
      expect(isCancelErrorCtorNode(null, mockContext)).toBe(false);
    });
  });
});
