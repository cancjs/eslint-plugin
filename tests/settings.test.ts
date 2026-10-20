import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';

import { getCancSettings } from '../src/util/settings.js';

describe('settings', () => {
  it('default sources include all current packages and subpaths', () => {
    const mockContext = {
      settings: {},
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    const expected = [
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

    for (const source of expected) {
      expect(settings.sources).toContain(source);
    }
    expect(settings.sources).toHaveLength(expected.length);
  });

  it('default sources do not include removed or stale specifiers', () => {
    const mockContext = {
      settings: {},
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    const removed = [
      '@cancjs/lazy-promise',
      '@cancjs/lazy-promise/native',
      '@cancjs/promise/native',
      '@cancjs/coroutine/native',
      '@cancjs/coroutine/iter',
      '@cancjs/fetch/native',
      '@cancjs/toolbox/native',
      '@cancjs/decorators/native',
    ];

    for (const source of removed) {
      expect(settings.sources).not.toContain(source);
    }
  });

  it('user-provided sources extend defaults', () => {
    const mockContext = {
      settings: {
        canc: {
          sources: ['@my/custom-promise'],
        },
      },
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.sources).toContain('@cancjs/promise');
    expect(settings.sources).toContain('@cancjs/toolbox-native');
    expect(settings.sources).toContain('@my/custom-promise');
    expect(settings.sources).toHaveLength(34); // 33 defaults + 1 custom
  });

  it('default cancelableTypeNames include CancelablePromise', () => {
    const mockContext = {
      settings: {},
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.cancelableTypeNames).toContain('CancelablePromise');
  });

  it('default lazyTypeNames include LazyPromise', () => {
    const mockContext = {
      settings: {},
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.lazyTypeNames).toContain('LazyPromise');
  });

  it('default structuralDetection is false', () => {
    const mockContext = {
      settings: {},
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.structuralDetection).toBe(false);
  });

  it('default boundaryFunctions include all 8 boundary helpers', () => {
    const mockContext = {
      settings: {},
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    const expected = [
      'catchCancel',
      'suppressCancel',
      'catchAbort',
      'suppressAbort',
      'catchTimeout',
      'suppressTimeout',
      'suppressErrors',
      'catchErrors',
    ];

    for (const fn of expected) {
      expect(settings.boundaryFunctions).toContain(fn);
    }
    expect(settings.boundaryFunctions).toHaveLength(expected.length);
  });

  it('user-provided cancelableTypeNames extend defaults', () => {
    const mockContext = {
      settings: {
        canc: {
          cancelableTypeNames: ['MyCustomCancelable'],
        },
      },
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.cancelableTypeNames).toContain('CancelablePromise');
    expect(settings.cancelableTypeNames).toContain('MyCustomCancelable');
  });

  it('user-provided lazyTypeNames extend defaults', () => {
    const mockContext = {
      settings: {
        canc: {
          lazyTypeNames: ['MyLazyPromise'],
        },
      },
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.lazyTypeNames).toContain('LazyPromise');
    expect(settings.lazyTypeNames).toContain('MyLazyPromise');
  });

  it('user-provided boundaryFunctions extend defaults', () => {
    const mockContext = {
      settings: {
        canc: {
          boundaryFunctions: ['myBoundary'],
        },
      },
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.boundaryFunctions).toContain('catchCancel');
    expect(settings.boundaryFunctions).toContain('suppressCancel');
    expect(settings.boundaryFunctions).toContain('catchAbort');
    expect(settings.boundaryFunctions).toContain('suppressAbort');
    expect(settings.boundaryFunctions).toContain('catchTimeout');
    expect(settings.boundaryFunctions).toContain('suppressTimeout');
    expect(settings.boundaryFunctions).toContain('suppressErrors');
    expect(settings.boundaryFunctions).toContain('catchErrors');
    expect(settings.boundaryFunctions).toContain('myBoundary');
    expect(settings.boundaryFunctions).toHaveLength(9);
  });

  it('user-provided structuralDetection overrides default', () => {
    const mockContext = {
      settings: {
        canc: {
          structuralDetection: true,
        },
      },
    } as unknown as TSESLint.RuleContext<string, unknown[]>;

    const settings = getCancSettings(mockContext);

    expect(settings.structuralDetection).toBe(true);
  });
});
