import { ESLintUtils } from '@typescript-eslint/utils';

export default ESLintUtils.RuleCreator(
 (name) => `https://github.com/cancjs/eslint-plugin-canc/blob/master/docs/rules/${name}.md`,
);
