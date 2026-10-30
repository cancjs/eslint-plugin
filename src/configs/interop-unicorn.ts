import type { Linter } from 'eslint';

export interface InteropUnicornOptions {
  /** Globs of files that define lazy thenables, where `unicorn/no-thenable` is turned off. */
  thenableFiles?: string[];
}

/** Builds the unicorn interop config. Without `thenableFiles`, `no-thenable` stays on. */
export function buildInteropUnicorn(options: InteropUnicornOptions = {}): Linter.Config[] {
  const configs: Linter.Config[] = [
    {
      name: 'canc/interop-unicorn',
      rules: { 'unicorn/prefer-top-level-await': 'off' },
    },
  ];
  if (options.thenableFiles && options.thenableFiles.length > 0) {
    configs.push({
      name: 'canc/interop-unicorn-thenable',
      files: options.thenableFiles,
      rules: { 'unicorn/no-thenable': 'off' },
    });
  }
  return configs;
}

export const interopUnicorn: Linter.Config[] = buildInteropUnicorn();
