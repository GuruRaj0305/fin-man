import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { Env } from './types';

const enc = new TextEncoder();
function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function unhex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
}
export function constantEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
/** Workers caps PBKDF2 iterations per call. Six independent chained 100k rounds
 * keep each call compatible while requiring 600k sequential PBKDF2 work overall. */
export async function hashPassword(
  password: string,
  salt = hex(crypto.getRandomValues(new Uint8Array(24))),
): Promise<string> {
  let material = enc.encode(password);
  for (let round = 0; round < 6; round++) {
    const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    material = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 100000,
          salt: unhex(salt + round.toString(16).padStart(2, '0')),
        },
        key,
        256,
      ),
    );
  }
  return `pbkdf2-chain-sha256$6$100000$${salt}$${hex(material)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (
    parts.length !== 5 ||
    parts[0] !== 'pbkdf2-chain-sha256' ||
    parts[1] !== '6' ||
    parts[2] !== '100000' ||
    !/^[0-9a-f]{48}$/.test(parts[3])
  )
    return false;
  return constantEqual(await hashPassword(password, parts[3]), stored);
}
export async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}
export async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}
const IDLE = 7 * 86400,
  ABSOLUTE = 30 * 86400;
function cookieOptions(c: Context<Env>) {
  return {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Strict' as const,
    path: '/',
    maxAge: IDLE,
  };
}
function cookieName(c: Context<Env>) {
  return c.env.ENVIRONMENT === 'development' ? 'folio_session' : '__Host-folio_session';
}
export async function createSession(c: Context<Env>): Promise<void> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32))),
    now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? OR absolute_expires_at < ?').bind(
      now,
      now,
    ),
    c.env.DB.prepare(
      'INSERT INTO sessions(token_hash,user_id,expires_at,absolute_expires_at) VALUES(?,1,?,?)',
    ).bind(await digest(token), now + IDLE, now + ABSOLUTE),
  ]);
  setCookie(
    c,
    cookieName(c),
    `${token}.${await sign(token, c.env.SESSION_SECRET)}`,
    cookieOptions(c),
  );
}
export async function readSession(c: Context<Env>): Promise<string | null> {
  const raw = getCookie(c, cookieName(c));
  if (!raw) return null;
  const [token, signature] = raw.split('.');
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    !signature ||
    !constantEqual(await sign(token, c.env.SESSION_SECRET), signature)
  )
    return null;
  const key = await digest(token),
    now = Math.floor(Date.now() / 1000);
  const s = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE token_hash=? AND expires_at>? AND absolute_expires_at>?',
  )
    .bind(key, now, now)
    .first<{ expires_at: number; absolute_expires_at: number }>();
  if (!s) return null;
  const expires = Math.min(now + IDLE, s.absolute_expires_at);
  // Refresh at most once per hour to avoid writes on every authenticated read.
  if (expires - s.expires_at >= 3600) {
    await c.env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?')
      .bind(expires, key)
      .run();
    setCookie(c, cookieName(c), raw, { ...cookieOptions(c), maxAge: expires - now });
  }
  return key;
}
export function clearSession(c: Context<Env>): void {
  deleteCookie(c, cookieName(c), {
    path: '/',
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Strict',
  });
}
