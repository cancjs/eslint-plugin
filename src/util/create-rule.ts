import { ESLintUtils } from '@typescript-eslint/utils';

export interface CancRuleDocs {
  description: string;
  requiresTypeChecking?: boolean;
}

export default ESLintUtils.RuleCreator<CancRuleDocs>(
  (name) => `https://github.com/cancjs/eslint-plugin/blob/master/docs/rules/${name}.md`,
);
