import { mkdirSync, writeFileSync } from 'node:fs';
import { root } from './runtime.mjs';

export const e2ePersistencePath = `${root}.local/e2e-d1`;

export function writeE2eConfig() {
  const path = `${root}.local/e2e-api/wrangler.toml`;
  mkdirSync(`${root}.local/e2e-api`, { recursive: true });
  writeFileSync(
    path,
    `name="folio-e2e-local-only"\nmain="${root}apps/api/src/index.ts"\ncompatibility_date="2025-10-01"\nworkers_dev=false\n[[d1_databases]]\nbinding="DB"\ndatabase_name="folio-finance"\ndatabase_id="00000000-0000-0000-0000-000000000000"\nmigrations_dir="${root}apps/api/migrations"\n[vars]\nENVIRONMENT="development"\nAPP_ORIGIN="http://localhost:5174"\nSESSION_SECRET="isolated-e2e-local-test-secret-never-for-production"\n`,
  );
  return path;
}
