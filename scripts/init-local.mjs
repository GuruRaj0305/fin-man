import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('../apps/api/.dev.vars', import.meta.url));
if (!existsSync(path)) {
  writeFileSync(
    path,
    `SESSION_SECRET=${randomBytes(48).toString('hex')}\nAPP_ORIGIN=http://localhost:5179\nENVIRONMENT=development\n`,
    { mode: 0o600 },
  );
  console.log('Created a private random local session secret.');
} else console.log('Local environment already exists.');
