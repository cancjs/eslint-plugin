import { buildConfigs, type PluginConfigs } from './build.js';
import type { TierEntry } from './tiers.js';

// Same three presets, limited to the rules that apply to native-twin consumers.
export function buildNativeConfigs(plugin: unknown, tiers: Record<string, TierEntry>): PluginConfigs {
  const nativeTiers: Record<string, TierEntry> = {};
  for (const [name, entry] of Object.entries(tiers)) {
    if (entry.native) {
      nativeTiers[name] = entry;
    }
  }
  return buildConfigs(plugin, nativeTiers);
}
