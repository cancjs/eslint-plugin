// docs-only entry, not exported or packed
// generator derives the rule prefix from meta.name, rules use the canc namespace
const plugin = require('../../dist/index.cjs');

module.exports = { ...plugin, meta: { ...plugin.meta, name: 'eslint-plugin-canc' } };
