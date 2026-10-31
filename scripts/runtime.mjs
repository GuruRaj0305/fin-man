import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function workerEnvironment() {
  mkdirSync(`${root}.local`, { recursive: true });
  const sink = `${root}.local/wrangler.log`;
  // Wrangler's inspector writes D1 responses to its debug file even at normal
  // console verbosity. Discard that file to keep financial records out of logs.
  rmSync(sink, { force: true });
  symlinkSync('/dev/null', sink);
  return {
    ...process.env,
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_LOG_SANITIZE: 'true',
    WRANGLER_LOG_PATH: sink,
  };
}
