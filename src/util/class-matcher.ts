import type { TypeOrValueSpecifier } from '@typescript-eslint/type-utils';
import { typeMatchesSpecifier, typeOrValueSpecifiersSchema } from '@typescript-eslint/type-utils';
import type ts from 'typescript';

export interface ExtendsSpecifier {
  extends: string;
}

export type ClassMatcher = string | TypeOrValueSpecifier | ExtendsSpecifier;

export interface ClassMatcherOptions {
  include?: ClassMatcher[];
  exclude?: ClassMatcher[];
}

export const classMatcherSchema = {
  type: 'array',
  items: {
    oneOf: [
      {
        type: 'string',
      },
      ...typeOrValueSpecifiersSchema.items.oneOf.slice(1),
      {
        type: 'object',
        properties: {
          extends: {
            type: 'string',
          },
        },
        required: ['extends'],
        additionalProperties: false,
      },
    ],
  },
};

export interface CompiledRegexMatcher {
  type: 'regex';
  raw: string;
  regex: RegExp;
}

export interface CompiledExactNameMatcher {
  type: 'name';
  name: string;
}

export interface CompiledSpecifierMatcher {
  type: 'specifier';
  specifier: TypeOrValueSpecifier;
}

export interface CompiledExtendsMatcher {
  type: 'extends';
  raw: string;
  exact?: string;
  regex?: RegExp;
}

export type CompiledMatcher =
  CompiledRegexMatcher | CompiledExactNameMatcher | CompiledSpecifierMatcher | CompiledExtendsMatcher;

export type CompiledMatchers = CompiledMatcher[];

export interface CompiledClassMatcherOptions {
  include?: CompiledMatchers;
  exclude?: CompiledMatchers;
}

const REGEX_SLASH_PATTERN = /^\/(.+)\/([a-zA-Z]*)$/;
const ALLOWED_REGEX_FLAGS = new Set(['d', 'i', 'm', 's', 'u', 'v']);

function parseRegexString(str: string): { body: string; flags: string } | null {
  const match = REGEX_SLASH_PATTERN.exec(str);
  if (!match) return null;
  return { body: match[1], flags: match[2] };
}

function compileSingleMatcher(matcher: ClassMatcher): CompiledMatcher {
  if (typeof matcher === 'string') {
    const parsedRegex = parseRegexString(matcher);
    if (parsedRegex) {
      const { body, flags } = parsedRegex;
      for (const flag of flags) {
        if (flag === 'g' || flag === 'y') {
          throw new Error(`Invalid regex matcher "${matcher}": flag '${flag}' is not permitted`);
        }
        if (!ALLOWED_REGEX_FLAGS.has(flag)) {
          throw new Error(`Invalid regex matcher "${matcher}": unrecognized flag '${flag}'`);
        }
      }
      try {
        const regex = new RegExp(body, flags);
        return { type: 'regex', raw: matcher, regex };
      } catch (err) {
        throw new Error(`Invalid regex matcher "${matcher}": ${(err as Error).message}`, { cause: err });
      }
    }
    return { type: 'name', name: matcher };
  }

  if (typeof matcher === 'object' && matcher !== null) {
    if ('extends' in matcher) {
      const ext = matcher.extends;
      const parsedRegex = parseRegexString(ext);
      if (parsedRegex) {
        const { body, flags } = parsedRegex;
        for (const flag of flags) {
          if (flag === 'g' || flag === 'y') {
            throw new Error(`Invalid regex matcher in extends "${ext}": flag '${flag}' is not permitted`);
          }
          if (!ALLOWED_REGEX_FLAGS.has(flag)) {
            throw new Error(`Invalid regex matcher in extends "${ext}": unrecognized flag '${flag}'`);
          }
        }
        try {
          const regex = new RegExp(body, flags);
          return { type: 'extends', raw: ext, regex };
        } catch (err) {
          throw new Error(`Invalid regex in extends "${ext}": ${(err as Error).message}`, { cause: err });
        }
      }
      return { type: 'extends', raw: ext, exact: ext };
    }

    if ('from' in matcher && 'name' in matcher) {
      return { type: 'specifier', specifier: matcher as TypeOrValueSpecifier };
    }
  }

  throw new Error(`Unrecognized class matcher shape: ${JSON.stringify(matcher)}`);
}

export function compileMatchers(matchers?: readonly ClassMatcher[] | null): CompiledMatchers {
  if (!matchers || matchers.length === 0) return [];
  return matchers.map(compileSingleMatcher);
}

export function compileOptions(opts?: ClassMatcherOptions | null): CompiledClassMatcherOptions {
  if (!opts) return {};
  return {
    include: opts.include ? compileMatchers(opts.include) : undefined,
    exclude: opts.exclude ? compileMatchers(opts.exclude) : undefined,
  };
}

export function matchesName(compiled: CompiledMatchers, className: string): boolean {
  for (const matcher of compiled) {
    if (matcher.type === 'name') {
      if (matcher.name === className) return true;
    } else if (matcher.type === 'regex') {
      if (matcher.regex.test(className)) return true;
    }
  }
  return false;
}

function typeMatchesExtends(
  extMatcher: CompiledExtendsMatcher,
  type: ts.Type,
  checker: ts.TypeChecker,
  visited: Set<ts.Type> = new Set(),
): boolean {
  if (visited.has(type)) return false;
  visited.add(type);

  const baseTypes =
    type.isClassOrInterface() || type.flags & 524288 /* Object */ ?
      (checker.getBaseTypes(type as ts.InterfaceType) ?? [])
    : [];

  for (const base of baseTypes) {
    const sym = base.aliasSymbol ?? base.getSymbol() ?? base.symbol;
    const name = sym?.name;
    if (name) {
      if (extMatcher.exact !== undefined && name === extMatcher.exact) {
        return true;
      }
      if (extMatcher.regex !== undefined && extMatcher.regex.test(name)) {
        return true;
      }
    }
    if (typeMatchesExtends(extMatcher, base, checker, visited)) {
      return true;
    }
  }
  return false;
}

export function matchesType(
  compiled: CompiledMatchers,
  type: ts.Type,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  for (const matcher of compiled) {
    if (matcher.type === 'specifier') {
      if (typeMatchesSpecifier(type, matcher.specifier, program)) {
        return true;
      }
    } else if (matcher.type === 'name') {
      if (typeMatchesSpecifier(type, matcher.name, program)) {
        return true;
      }
      const sym = type.aliasSymbol ?? type.getSymbol() ?? type.symbol;
      if (sym && sym.name === matcher.name) {
        return true;
      }
    } else if (matcher.type === 'regex') {
      const sym = type.aliasSymbol ?? type.getSymbol() ?? type.symbol;
      if (sym && matcher.regex.test(sym.name)) {
        return true;
      }
    } else if (matcher.type === 'extends') {
      if (typeMatchesExtends(matcher, type, checker)) {
        return true;
      }
    }
  }
  return false;
}

export interface MatchSubject {
  name?: string;
  type?: ts.Type;
  checker?: ts.TypeChecker;
  program?: ts.Program;
}

function isCompiledMatchers(matchers: readonly unknown[]): matchers is CompiledMatchers {
  if (matchers.length === 0) return true;
  const first = matchers[0];
  return typeof first === 'object' && first !== null && 'type' in first;
}

export function isIncluded(
  opts: CompiledClassMatcherOptions | ClassMatcherOptions,
  subject: MatchSubject,
  checker?: ts.TypeChecker,
  program?: ts.Program,
): boolean {
  const chk = subject.checker ?? checker;
  const prog = subject.program ?? program;

  const compiledExclude =
    Array.isArray(opts.exclude) ?
      isCompiledMatchers(opts.exclude) ? opts.exclude
      : compileMatchers(opts.exclude)
    : undefined;

  const compiledInclude =
    Array.isArray(opts.include) ?
      isCompiledMatchers(opts.include) ? opts.include
      : compileMatchers(opts.include)
    : undefined;

  const matches = (matchers: CompiledMatchers): boolean => {
    if (matchers.length === 0) return false;
    if (subject.type && chk && prog) {
      if (matchesType(matchers, subject.type, chk, prog)) {
        return true;
      }
    }
    if (subject.name) {
      if (matchesName(matchers, subject.name)) {
        return true;
      }
    }
    return false;
  };

  if (compiledExclude && compiledExclude.length > 0 && matches(compiledExclude)) {
    return false;
  }

  if (!compiledInclude || compiledInclude.length === 0) {
    return true;
  }

  return matches(compiledInclude);
}
