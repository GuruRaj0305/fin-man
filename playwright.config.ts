import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const executable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      ...(executable ? { executablePath: executable } : {}),
      args: ['--no-sandbox'],
    },
  },
  webServer: [
    {
      command: 'node scripts/e2e-server.mjs',
      url: 'http://127.0.0.1:8788/api/v1/auth/status',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        'npm run build -w apps/web && API_PROXY_PORT=8788 npm run preview -w apps/web -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
