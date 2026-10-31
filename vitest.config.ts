import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/shared/src/**/*.test.ts',
      'apps/api/tests/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    environment: 'node',
  },
});
