import type { ESLint } from 'eslint';

import { buildNativeConfigs } from './configs/native.js';
import { TIERS } from './configs/tiers.js';
import plugin from './index.js';

const nativePlugin: ESLint.Plugin = {
  ...plugin,
  configs: buildNativeConfigs(plugin, TIERS),
};

export default nativePlugin;
