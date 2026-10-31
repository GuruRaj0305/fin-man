import { workerEnvironment } from './runtime.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const reset = spawnSync(process.execPath, [`${root}scripts/local-db.mjs`, 'reset', '--e2e'], {
  cwd: root,
  stdio: 'inherit',
});
if (reset.status !== 0) process.exit(reset.status ?? 1);
mkdirSync(`${root}.local/e2e-api`, { recursive: true });
const path = `${root}.local/e2e-api/wrangler.toml`;
writeFileSync(
  path,
  `name="folio-e2e-local-only"\nmain="${root}apps/api/src/index.ts"\ncompatibility_date="2025-10-01"\nworkers_dev=false\n[[d1_databases]]\nbinding="DB"\ndatabase_name="folio-finance"\ndatabase_id="00000000-0000-0000-0000-000000000000"\nmigrations_dir="${root}apps/api/migrations"\n[vars]\nENVIRONMENT="development"\nAPP_ORIGIN="http://localhost:5174"\nSESSION_SECRET="isolated-e2e-local-test-secret-never-for-production"\n`,
);
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
    `${root}.local/e2e-d1`,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: workerEnvironment(),
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
