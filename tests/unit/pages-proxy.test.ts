import { expect, it, vi } from 'vitest';
import { onRequest } from '../../apps/web/functions/api/[[path]]';

it('preserves the same-origin request and security/session response headers', async () => {
  const request = new Request('https://fin.gururajhr.in/api/v1/auth/status', {
    headers: { Origin: 'https://fin.gururajhr.in', Cookie: '__Host-folio_session=test-only' },
  });
  const response = new Response('{"authenticated":true}', {
    headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': '__Host-folio_session=test-only; Secure; HttpOnly; SameSite=Strict; Path=/',
    },
  });
  const fetch = vi.fn(async () => response);
  const result = await onRequest({ request, env: { API: { fetch } } });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
  expect(result).toBe(response);
  expect(result.headers.get('Set-Cookie')).toContain('Secure; HttpOnly; SameSite=Strict');
  expect(result.headers.get('Cache-Control')).toBe('no-store');
});

it('keeps preview environments without a binding away from production', async () => {
  const result = await onRequest({
    request: new Request('https://preview.example/api/v1/accounts'),
    env: {},
  });
  expect(result.status).toBe(503);
  expect(result.headers.get('Cache-Control')).toBe('no-store');
});
