// Loads each entry of the installed package through native ESM and lints one bad file with it.
// argv: <package name> <file path for the bad source>
const [name, filePath] = process.argv.slice(2);

const BAD_SOURCE =
  "import { CancelablePromise } from '@cancjs/promise';\n" +
  "import { internal } from '@cancjs/promise/dist/cancelable-promise';\n" +
  'new CancelablePromise(async (resolve) => {\n  resolve(internal);\n});\n';

const { ESLint } = await import('eslint');
const entries = { main: name, native: `${name}/native` };
const out = [];

for (const [entry, specifier] of Object.entries(entries)) {
  try {
    const plugin = (await import(specifier)).default;
    const configs = Object.keys(plugin.configs);
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [...plugin.configs.recommended] });
    const [result] = await eslint.lintText(BAD_SOURCE, { filePath });
    const rules = [...new Set(result.messages.map((m) => m.ruleId))].sort();
    out.push({ format: 'import', entry, configs, rules });
  } catch (error) {
    out.push({ format: 'import', entry, error: String(error && error.message) });
  }
}

console.log(JSON.stringify(out));
