import type { TSESLint } from '@typescript-eslint/utils';
import type { Rule } from 'eslint';

export const rules: Record<string, Rule.RuleModule | TSESLint.RuleModule<string, readonly unknown[]>> = {};
