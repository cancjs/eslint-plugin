import { describe, expect, it } from 'vitest';

import { isPublicSubpath, parseCancSubpath, PUBLIC_SUBPATHS } from '../src/util/public-subpaths.js';

describe('public-subpaths', () => {
  it('contains expected packages and subpaths per Facts', () => {
    expect(PUBLIC_SUBPATHS['@cancjs/coroutine']).toEqual(['./gen']);
    expect(PUBLIC_SUBPATHS['@cancjs/toolbox']).toEqual(['./async-iter']);
    expect(PUBLIC_SUBPATHS['@cancjs/decorators']).toEqual(['./legacy', './babel-legacy']);
    expect(PUBLIC_SUBPATHS['@cancjs/unhandled-rejection']).toEqual(['./register']);
    expect(PUBLIC_SUBPATHS['@cancjs/node']).toEqual([
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
    ]);
    expect(PUBLIC_SUBPATHS['@cancjs/promise']).toEqual([]);
    expect(PUBLIC_SUBPATHS['@cancjs/toolbox-native']).toEqual([]);
  });

  it('correctly parses canc subpaths', () => {
    expect(parseCancSubpath('@cancjs/coroutine/gen')).toEqual({
      root: '@cancjs/coroutine',
      subpath: 'gen',
    });
    expect(parseCancSubpath('@cancjs/node/fs/extra')).toEqual({
      root: '@cancjs/node',
      subpath: 'fs/extra',
    });
    expect(parseCancSubpath('@cancjs/promise')).toBeNull();
    expect(parseCancSubpath('lodash/get')).toBeNull();
  });

  it('recognizes allowlisted public subpaths', () => {
    expect(isPublicSubpath('@cancjs/coroutine/gen')).toBe(true);
    expect(isPublicSubpath('@cancjs/toolbox/async-iter')).toBe(true);
    expect(isPublicSubpath('@cancjs/node/fs')).toBe(true);
    expect(isPublicSubpath('@cancjs/node/fs/extra')).toBe(true);
    expect(isPublicSubpath('@cancjs/promise')).toBe(true); // Root package is public
  });

  it('flags internal subpaths', () => {
    expect(isPublicSubpath('@cancjs/promise/dist/cancelable-promise')).toBe(false);
    expect(isPublicSubpath('@cancjs/promise/cancelable-promise')).toBe(false);
    expect(isPublicSubpath('@cancjs/coroutine/internal/x')).toBe(false);
    expect(isPublicSubpath('@cancjs/node/internal/x')).toBe(false);
    expect(isPublicSubpath('@cancjs/unknown/path')).toBe(false);
  });

  it('respects user-configured sources extension', () => {
    expect(isPublicSubpath('@cancjs/promise/custom', ['@cancjs/promise/custom'])).toBe(true);
  });
});
