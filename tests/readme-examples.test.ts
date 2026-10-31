import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const distEntry = pathToFileURL(path.join(root, 'dist', 'index.mjs')).href;
const corpusDir = path.join(root, 'tests', 'fixtures', 'corpus', 'executor', 'invalid');

function fencedBlocks(text: string): string[] {
  return [...text.matchAll(/```js\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
}

const snippets = fencedBlocks(readme).filter((block) => block.startsWith('// readme-test'));

// the package name only resolves from inside the package, so examples load the built entry by URL
function materialize(snippet: string): string {
  return snippet.replaceAll(/from '([^']+)'/g, (_whole, specifier: string) => {
    if (specifier === '@cancjs/eslint-plugin') return `from '${distEntry}'`;
    return `from '${pathToFileURL(requireFromRoot.resolve(specifier)).href}'`;
  });
}

describe('readme examples', () => {
  let tmp = '';
  const tmpRoot = path.join(os.tmpdir(), 'canc');

  beforeAll(() => {
    if (!fs.existsSync(path.join(root, 'dist', 'index.mjs'))) {
      throw new Error('dist is missing, run npm run build first');
    }
    fs.mkdirSync(tmpRoot, { recursive: true });
    tmp = fs.mkdtempSync(path.join(tmpRoot, 'readme-'));
    const first = fs.readdirSync(corpusDir).sort()[0];
    fs.copyFileSync(path.join(corpusDir, first), path.join(tmp, 'fixture.ts'));
    fs.writeFileSync(
      path.join(tmp, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['*.ts'],
      }),
    );
  });

  afterAll(() => {
    if (tmp !== '') fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('has at least two runnable config examples', () => {
    expect(snippets.length).toBeGreaterThanOrEqual(2);
  });

  it('lints a corpus file with every runnable example', async () => {
    for (const [index, snippet] of snippets.entries()) {
      const configPath = path.join(tmp, `eslint.config.${index}.mjs`);
      fs.writeFileSync(configPath, materialize(snippet));
      const eslint = new ESLint({ cwd: tmp, overrideConfigFile: configPath });
      const [result] = await eslint.lintFiles(['fixture.ts']);
      const fatal = result.messages.filter((message) => message.fatal);
      expect(fatal, `example ${index} has a config or parse error`).toEqual([]);
      const ids = result.messages.map((message) => message.ruleId ?? '');
      expect(
        ids.some((id) => id.startsWith('canc/')),
        `example ${index} reports a canc rule`,
      ).toBe(true);
    }
    console.log(`executed ${snippets.length} readme snippets`);
  });

  it('lists exactly the exported presets in the preset table', async () => {
    const plugin = (await import(distEntry)) as { default: { configs: Record<string, unknown> } };
    const section = /## Presets\r?\n([\s\S]*?)(?=\r?\n## )/.exec(readme)?.[1] ?? '';
    const rows = [...section.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
    expect(rows.sort()).toEqual(Object.keys(plugin.default.configs).sort());
  });

  it('documents only settings keys that exist', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'util', 'settings.ts'), 'utf8');
    const body = /export interface CancSettings \{([\s\S]*?)\}/.exec(source)?.[1] ?? '';
    const keys = [...body.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]);
    const section = /## Settings\r?\n([\s\S]*?)(?=\r?\n## )/.exec(readme)?.[1] ?? '';
    const documented = [...section.matchAll(/^- `(\w+)`:/gm)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect(documented.sort()).toEqual(keys.sort());
  });
});
