// Runs the same commands as .github/workflows/ci.yml, in file order.
// Usage: node scripts/ci-local.mjs [--print]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

// the workflow keeps one `run:` per line, so a line scan is enough
const commands = [];
for (const line of workflow.split(/\r?\n/)) {
  const match = /^\s*-\s+run:\s*(.+?)\s*$/.exec(line);
  if (!match) continue;
  const command = match[1];
  if (command === 'npm ci' && commands.includes(command)) continue;
  commands.push(command);
}

if (process.argv.includes('--print')) {
  for (const command of commands) console.log(command);
  process.exit(0);
}

for (const command of commands) {
  const full = command === 'npm test' ? `${command} -- --maxWorkers=4` : command;
  console.log(`> ${full}`);
  const result = spawnSync(full, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
