import type { TSESLint } from '@typescript-eslint/utils';

export interface CancSettings {
  sources?: string[];
  cancelableTypeNames?: string[];
  lazyTypeNames?: string[];
  structuralDetection?: boolean;
  boundaryFunctions?: string[];
}

export interface ResolvedCancSettings {
  sources: string[];
  cancelableTypeNames: string[];
  lazyTypeNames: string[];
  structuralDetection: boolean;
  boundaryFunctions: string[];
}

const DEFAULT_SOURCES = [
  '@cancjs/promise',
  '@cancjs/coroutine',
  '@cancjs/coroutine/gen',
  '@cancjs/toolbox',
  '@cancjs/toolbox/async-iter',
  '@cancjs/toolbox-native',
  '@cancjs/fetch',
  '@cancjs/decorators',
  '@cancjs/decorators/legacy',
  '@cancjs/decorators/babel-legacy',
  '@cancjs/axios',
  '@cancjs/node',
  '@cancjs/node/fs',
  '@cancjs/node/fs/sync',
  '@cancjs/node/fs/register-graceful',
  '@cancjs/node/fs/extra',
  '@cancjs/node/child-process',
  '@cancjs/node/timers',
  '@cancjs/node/stream',
  '@cancjs/node/events',
  '@cancjs/node/dns',
  '@cancjs/node/readline',
  '@cancjs/node/crypto',
  '@cancjs/node/zlib',
  '@cancjs/node/worker-threads',
  '@cancjs/node/dgram',
  '@cancjs/unhandled-rejection',
  '@cancjs/unhandled-rejection/register',
  '@cancjs/server-express',
  '@cancjs/server-fastify',
  '@cancjs/server-hono',
  '@cancjs/server-koa',
  '@cancjs/server-node',
];

const DEFAULT_SETTINGS: ResolvedCancSettings = {
  sources: DEFAULT_SOURCES,
  cancelableTypeNames: ['CancelablePromise'],
  lazyTypeNames: ['LazyPromise'],
  structuralDetection: false,
  boundaryFunctions: [
    'catchCancel',
    'suppressCancel',
    'catchAbort',
    'suppressAbort',
    'catchTimeout',
    'suppressTimeout',
    'suppressErrors',
    'catchErrors',
  ],
};

export function getCancSettings(context: TSESLint.RuleContext<string, readonly unknown[]>): ResolvedCancSettings {
  const settings = context.settings.canc as CancSettings | undefined;

  if (!settings) {
    return DEFAULT_SETTINGS;
  }

  return {
    sources: settings.sources ? [...DEFAULT_SOURCES, ...settings.sources] : DEFAULT_SOURCES,
    cancelableTypeNames:
      settings.cancelableTypeNames ?
        [...DEFAULT_SETTINGS.cancelableTypeNames, ...settings.cancelableTypeNames]
      : DEFAULT_SETTINGS.cancelableTypeNames,
    lazyTypeNames:
      settings.lazyTypeNames ?
        [...DEFAULT_SETTINGS.lazyTypeNames, ...settings.lazyTypeNames]
      : DEFAULT_SETTINGS.lazyTypeNames,
    structuralDetection:
      settings.structuralDetection !== undefined ? settings.structuralDetection : DEFAULT_SETTINGS.structuralDetection,
    boundaryFunctions:
      settings.boundaryFunctions ?
        [...DEFAULT_SETTINGS.boundaryFunctions, ...settings.boundaryFunctions]
      : DEFAULT_SETTINGS.boundaryFunctions,
  };
}

const nominalSettingsCache = new WeakMap<ResolvedCancSettings, ResolvedCancSettings>();

export function nominalSettings(settings: ResolvedCancSettings): ResolvedCancSettings {
  if (!settings.structuralDetection) {
    return settings;
  }
  let cached = nominalSettingsCache.get(settings);
  if (!cached) {
    cached = {
      ...settings,
      structuralDetection: false,
    };
    nominalSettingsCache.set(settings, cached);
  }
  return cached;
}
