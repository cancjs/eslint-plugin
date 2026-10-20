import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUBS_ROOT = join(__dirname, 'fixtures', 'projects', 'default', 'node_modules', '@cancjs');

interface StubsMeta {
  monoCommitSubject: string;
  packages: Record<string, string>;
}

describe('fixture stubs integrity', () => {
  it('has the four required package directories with index.d.ts', () => {
    const packages = ['promise', 'coroutine', 'toolbox', 'toolbox-native'];
    for (const pkg of packages) {
      const indexDts = join(STUBS_ROOT, pkg, 'index.d.ts');
      expect(existsSync(indexDts), `expected ${pkg}/index.d.ts to exist`).toBe(true);
    }
  });

  it('contains FAILURE, Unlisted, and two-parameter CancelablePromise in promise types', () => {
    const cancelablePromiseDtsPath = join(STUBS_ROOT, 'promise', 'cancelable-promise.d.ts');
    expect(existsSync(cancelablePromiseDtsPath), 'expected cancelable-promise.d.ts to exist').toBe(true);

    const cancelablePromiseDts = readFileSync(cancelablePromiseDtsPath, 'utf8');
    const unlistedDtsPath = join(STUBS_ROOT, 'promise', '_util', 'unlisted.d.ts');
    expect(existsSync(unlistedDtsPath), 'expected _util/unlisted.d.ts to exist').toBe(true);

    const unlistedDts = readFileSync(unlistedDtsPath, 'utf8');

    expect(cancelablePromiseDts).toContain('FAILURE');
    expect(unlistedDts).toContain('Unlisted');
    expect(cancelablePromiseDts).toMatch(/class CancelablePromise<TResult,\s*TFailure = unknown>/);
  });

  it('has gen.d.ts in coroutine', () => {
    const genDts = join(STUBS_ROOT, 'coroutine', 'gen.d.ts');
    expect(existsSync(genDts), 'expected coroutine/gen.d.ts to exist').toBe(true);
  });

  it('does not have lazy-promise directory', () => {
    const lazyPromiseDir = join(STUBS_ROOT, 'lazy-promise');
    expect(existsSync(lazyPromiseDir), 'expected lazy-promise directory to be absent').toBe(false);
  });

  it('does not have coroutine/iter directory', () => {
    const iterDir = join(STUBS_ROOT, 'coroutine', 'iter');
    expect(existsSync(iterDir), 'expected coroutine/iter directory to be absent').toBe(false);
  });

  it('lists the four packages in STUBS.json', () => {
    const stubsJsonPath = join(STUBS_ROOT, 'STUBS.json');
    expect(existsSync(stubsJsonPath), 'expected STUBS.json to exist').toBe(true);

    const content = JSON.parse(readFileSync(stubsJsonPath, 'utf8')) as StubsMeta;
    expect(typeof content.monoCommitSubject).toBe('string');
    expect(content.monoCommitSubject.length).toBeGreaterThan(0);
    expect(typeof content.packages['@cancjs/coroutine']).toBe('string');
    expect(typeof content.packages['@cancjs/promise']).toBe('string');
    expect(typeof content.packages['@cancjs/toolbox']).toBe('string');
    expect(typeof content.packages['@cancjs/toolbox-native']).toBe('string');
    expect(Object.keys(content.packages).sort()).toEqual([
      '@cancjs/coroutine',
      '@cancjs/promise',
      '@cancjs/toolbox',
      '@cancjs/toolbox-native',
    ]);
  });
});
