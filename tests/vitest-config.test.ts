import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

interface LoadedConfig {
  default: { test?: { maxWorkers?: unknown; testTimeout?: unknown; hookTimeout?: unknown } };
}

const configUrl = pathToFileURL(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vitest.config.ts'),
).href;

describe('vitest config', () => {
  it('caps workers between one and four', async () => {
    // loaded by url so the type project does not absorb the config file
    const loaded = (await import(/* @vite-ignore */ configUrl)) as LoadedConfig;
    const cap = loaded.default.test?.maxWorkers;
    expect(typeof cap).toBe('number');
    expect(cap as number).toBeGreaterThanOrEqual(1);
    expect(cap as number).toBeLessThanOrEqual(4);
  });

  it('gives the type-aware lint tests room on slow runners', async () => {
    const loaded = (await import(/* @vite-ignore */ configUrl)) as LoadedConfig;
    expect(loaded.default.test?.testTimeout).toBe(60_000);
    expect(loaded.default.test?.hookTimeout).toBe(60_000);
  });
});
