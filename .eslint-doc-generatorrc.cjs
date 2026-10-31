const prettier = require('prettier');

// paths resolve from scripts/docs-plugin, the generator plugin root
/** @type {import('eslint-doc-generator').GenerateOptions} */
module.exports = {
  pathRuleDoc: '../../docs/rules/{name}.md',
  pathRuleList: '../../README.md',
  ruleDocTitleFormat: 'prefix-name',
  ruleDocSectionOptions: true,
  // match lint markdown options so tables stay lint-clean
  postprocess: (content) =>
    prettier.format(content, {
      parser: 'markdown',
      embeddedLanguageFormatting: 'off',
      singleQuote: true,
    }),
};
