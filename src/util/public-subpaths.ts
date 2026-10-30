export const PUBLIC_SUBPATHS: Record<string, readonly string[]> = {
  '@cancjs/coroutine': ['./gen'],
  '@cancjs/toolbox': ['./async-iter'],
  '@cancjs/decorators': ['./legacy', './babel-legacy'],
  '@cancjs/unhandled-rejection': ['./register'],
  '@cancjs/node': [
    './fs',
    './fs/sync',
    './fs/register-graceful',
    './fs/extra',
    './child-process',
    './timers',
    './stream',
    './events',
    './dns',
    './readline',
    './crypto',
    './zlib',
    './worker-threads',
    './dgram',
  ],
  '@cancjs/promise': [],
  '@cancjs/toolbox-native': [],
  '@cancjs/fetch': [],
  '@cancjs/axios': [],
  '@cancjs/server-express': [],
  '@cancjs/server-fastify': [],
  '@cancjs/server-hono': [],
  '@cancjs/server-koa': [],
  '@cancjs/server-node': [],
};

/**
 * Extracts root package name and subpath from an import specifier matching `@cancjs/<pkg>/<subpath>`.
 * Returns null if the source is not a subpath import under `@cancjs/`.
 */
export function parseCancSubpath(source: string): { root: string; subpath: string } | null {
  const match = /^(@cancjs\/[^/]+)\/(.+)$/.exec(source);
  if (!match) {
    return null;
  }
  return {
    root: match[1],
    subpath: match[2],
  };
}

/**
 * Returns true if `source` is an allowlisted public entry point, either built-in
 * to PUBLIC_SUBPATHS or declared in `settings.sources`.
 */
export function isPublicSubpath(source: string, configuredSources: readonly string[] = []): boolean {
  const parsed = parseCancSubpath(source);
  if (!parsed) {
    return true; // Not a subpath import
  }

  // Check user-configured sources first
  if (configuredSources.includes(source)) {
    return true;
  }

  const allowed = PUBLIC_SUBPATHS[parsed.root];
  if (!allowed) {
    return false;
  }

  const subpathWithDot = './' + parsed.subpath;
  return allowed.includes(subpathWithDot);
}
