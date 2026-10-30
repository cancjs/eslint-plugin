import type { TSESTree } from '@typescript-eslint/utils';

import { getCancServices } from '../util/canc-types.js';
import { type ClassMatcherOptions, classMatcherSchema, compileOptions } from '../util/class-matcher.js';
import createRule from '../util/create-rule.js';
import {
  classHasInstanceDiscriminant,
  isCancelErrorClass,
  isClassSelected,
  isClassUsedAsCancFailure,
} from '../util/failure-checker-require-error-discriminant.js';
import { extendsErrorTransitively } from '../util/failure-types.js';

export type MessageIds = 'missingDiscriminant';
export type RuleOptions = [ClassMatcherOptions?];

export default createRule<RuleOptions, MessageIds>({
  name: 'require-error-discriminant',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require declared error classes in failure sets to have a discriminant property.',
      requiresTypeChecking: true,
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          include: classMatcherSchema,
          exclude: classMatcherSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ include: [], exclude: [] }],
    messages: {
      missingDiscriminant:
        'Error class {{name}} has no member that tells it apart from other error classes. TypeScript compares classes by shape, so removing one from a failure union removes every identical class. Add a readonly discriminant field, a literal name, or a Symbol.for brand.',
    },
  },
  defaultOptions: [{ include: [], exclude: [] }],

  create(context) {
    const services = getCancServices(context);
    if (!services?.program || !services.esTreeNodeToTSNodeMap) {
      return {};
    }

    const options = compileOptions(context.options[0]);

    return {
      ClassDeclaration(node: TSESTree.ClassDeclaration) {
        if (!node.id) {
          return;
        }

        const classNode = node as TSESTree.ClassDeclaration & { id: TSESTree.Identifier };
        const className = node.id.name;

        if (!extendsErrorTransitively(node, context)) {
          return;
        }

        if (isCancelErrorClass(node, context) || classHasInstanceDiscriminant(node, context)) {
          return;
        }

        if (!isClassSelected(options, classNode, context)) {
          return;
        }

        if (!isClassUsedAsCancFailure(node, context)) {
          return;
        }

        context.report({
          node: node.id,
          messageId: 'missingDiscriminant',
          data: { name: className },
          suggest: [
            {
              messageId: 'missingDiscriminant',
              data: { name: className },
              fix(fixer) {
                if (node.body.body.length > 0) {
                  return fixer.insertTextBefore(node.body.body[0], `readonly kind = '${className}';\n  `);
                }
                const openBrace = context.sourceCode.getFirstToken(node.body);
                if (openBrace) {
                  return fixer.insertTextAfter(openBrace, `\n  readonly kind = '${className}';\n`);
                }
                return null;
              },
            },
          ],
        });
      },
    };
  },
});
