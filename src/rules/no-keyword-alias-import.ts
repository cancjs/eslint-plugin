import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import createRule from '../util/create-rule.js';

export type MessageIds = 'keywordAlias' | 'preferAlias';
export type RuleOptions = [];

const COROUTINE_ALIASES: Record<string, string> = {
  async: 'cancAsync',
  await: 'cancAwait',
  forAwait: 'cancForAwait',
  throw: 'cancThrow',
};

const GEN_ALIASES: Record<string, string> = {
  async: 'cancGenAsync',
  await: 'cancGenAwait',
  forAwait: 'cancGenForAwait',
  delegate: 'cancGenDelegate',
  throw: 'cancGenThrow',
};

function getAliasTable(source: string): Record<string, string> | null {
  if (source === '@cancjs/coroutine/gen' || source.endsWith('/coroutine/gen')) {
    return GEN_ALIASES;
  }
  if (source === '@cancjs/coroutine' || source.endsWith('/coroutine')) {
    return COROUTINE_ALIASES;
  }
  return null;
}

export default createRule<RuleOptions, MessageIds>({
  name: 'no-keyword-alias-import',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow importing keyword aliases from @cancjs/coroutine and @cancjs/coroutine/gen directly as named bindings; prefer canonical names or namespace imports.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      keywordAlias:
        "'{{name}}' as a bare import looks like a keyword and is easy to add by accident. Import '{{canonical}}' instead, or use the namespace form.",
      preferAlias:
        "'{{name}} as {{local}}' renames an export that already has a canonical name. Import '{{canonical}}' directly.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.importKind === 'type') {
          return;
        }

        const source = node.source.value;
        const aliasTable = getAliasTable(source);
        if (!aliasTable) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
            continue;
          }
          if (specifier.importKind === 'type') {
            continue;
          }

          const importedName =
            specifier.imported.type === AST_NODE_TYPES.Identifier ?
              specifier.imported.name
            : String(specifier.imported.value);

          const canonical = aliasTable[importedName];
          if (!canonical) {
            continue;
          }

          const isBare = specifier.local.name === importedName;

          context.report({
            node: specifier,
            messageId: isBare ? 'keywordAlias' : 'preferAlias',
            data: {
              name: importedName,
              canonical,
              local: specifier.local.name,
              source,
            },
            fix(fixer) {
              const scope = context.sourceCode.getScope(specifier.local);
              const existingVar = scope.variables.find(
                (v) => v.name === canonical && !v.defs.some((d) => d.name === specifier.local),
              );
              if (existingVar) {
                return null;
              }

              const fixes: TSESLint.RuleFix[] = [];
              fixes.push(fixer.replaceText(specifier, canonical));

              if (specifier.local.name !== canonical) {
                const declaredVars = context.sourceCode.getDeclaredVariables(node);
                const variable = declaredVars.find((v) => v.name === specifier.local.name);
                if (variable) {
                  for (const ref of variable.references) {
                    if (ref.identifier !== specifier.local) {
                      fixes.push(fixer.replaceText(ref.identifier, canonical));
                    }
                  }
                }
              }

              return fixes;
            },
          });
        }
      },
    };
  },
});
