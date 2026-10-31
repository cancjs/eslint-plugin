import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

interface LoadedConfig {
  default: { test?: { maxWorkers?: unknown } };
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
});
