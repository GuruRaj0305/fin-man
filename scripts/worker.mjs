import { workerEnvironment } from './runtime.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}.local`, { recursive: true });
const child = spawn(
  process.execPath,
  [`${root}node_modules/wrangler/bin/wrangler.js`, ...process.argv.slice(2)],
  {
    cwd: `${root}apps/api`,
    stdio: 'inherit',
    env: workerEnvironment(),
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
