import { setTimeout } from 'node:timers/promises';

const origin = 'https://fin.gururajhr.in';
const checks = [
  { path: '/', status: 200, type: 'text/html' },
  {
    path: '/manifest.webmanifest',
    status: 200,
    validate: async (response) => (await response.json()).display === 'standalone',
  },
  { path: '/sw.js', status: 200, type: 'javascript' },
  {
    path: '/api/v1/auth/status',
    status: 200,
    validate: async (response) => {
      const body = await response.json();
      return typeof body.needs_setup === 'boolean' && body.authenticated === false;
    },
  },
  { path: '/api/v1/accounts', status: 401, type: 'application/json' },
];

for (let attempt = 1; attempt <= 12; attempt++) {
  const failures = await Promise.all(
    checks.map(async ({ path, status, type, validate }) => {
      try {
        const response = await fetch(new URL(path, origin), {
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
          headers: { 'Cache-Control': 'no-cache' },
        });
        try {
          if (response.status !== status)
            return `${path}: expected ${status}, got ${response.status}`;
          if (type && !response.headers.get('content-type')?.includes(type)) {
            return `${path}: unexpected content type`;
          }
          if (validate && !(await validate(response))) return `${path}: unexpected response format`;
          return null;
        } finally {
          if (!response.bodyUsed) await response.body?.cancel();
        }
      } catch {
        return `${path}: request failed`;
      }
    }),
  );
  const errors = failures.filter(Boolean);
  if (!errors.length) {
    console.log(`Production checks passed: ${origin} (${checks.length} read-only endpoints).`);
    process.exit(0);
  }
  // Log only endpoint/status diagnostics, never response bodies or financial records.
  console.error(`Production check ${attempt}/12 failed: ${errors.join('; ')}`);
  if (attempt < 12) await setTimeout(5000);
}

process.exitCode = 1;
