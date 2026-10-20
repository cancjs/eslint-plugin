import type { ESLint } from 'eslint';

import pkg from '../package.json' with { type: 'json' };
import { buildConfigs } from './configs/build.js';
import { TIERS } from './configs/tiers.js';
import { rules } from './rules/index.js';

const plugin: ESLint.Plugin = {
  meta: {
    name: '@cancjs/eslint-plugin',
    version: pkg.version,
    namespace: 'canc',
  },
  rules: rules as unknown as NonNullable<ESLint.Plugin['rules']>,
};

plugin.configs = buildConfigs(plugin, TIERS);

export default plugin;
