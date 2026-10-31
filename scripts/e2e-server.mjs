import { workerEnvironment } from './runtime.mjs';
import { e2ePersistencePath, writeE2eConfig } from './e2e-config.mjs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const reset = spawnSync(process.execPath, [`${root}scripts/local-db.mjs`, 'reset', '--e2e'], {
  cwd: root,
  stdio: 'inherit',
});
if (reset.status !== 0) process.exit(reset.status ?? 1);
const path = writeE2eConfig();
const child = spawn(
  process.execPath,
  [
    `${root}node_modules/wrangler/bin/wrangler.js`,
    'dev',
    '--config',
    path,
    '--local',
    '--port',
    '8788',
    '--ip',
    '127.0.0.1',
    '--persist-to',
    e2ePersistencePath,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: workerEnvironment(),
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
