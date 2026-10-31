import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  registrationInput,
  loginInput,
  profileInput,
  passwordChangeInput,
  listQuery,
  type AuthStatus,
} from '@folio/shared';
import type { Env } from './types';
import {
  hashPassword,
  verifyPassword,
  sign,
  createSession,
  readSession,
  clearSession,
} from './auth';

const routes = new Hono<Env>();
type Ctx = Context<Env>;
const fields = 'id,name,email,role,created_at,last_login_at';
const empty = z.object({}).strict();
const now = () => new Date().toISOString();
const fail = (c: Ctx, code: string, message: string, status: 401 | 403 | 409 | 429) =>
  c.json({ error: { code, message } }, status);
const defaults = [
  ['cat_salary', 'Salary', 'income'],
  ['cat_freelance', 'Freelance', 'income'],
  ['cat_interest', 'Interest', 'income'],
  ['cat_income_other', 'Other', 'income'],
  ['cat_rent', 'Rent', 'expense'],
  ['cat_food', 'Food', 'expense'],
  ['cat_transport', 'Transport', 'expense'],
  ['cat_utilities', 'Utilities', 'expense'],
  ['cat_shopping', 'Shopping', 'expense'],
  ['cat_health', 'Health', 'expense'],
  ['cat_education', 'Education', 'expense'],
  ['cat_entertainment', 'Entertainment', 'expense'],
  ['cat_emi', 'EMI', 'expense'],
  ['cat_expense_other', 'Other', 'expense'],
];
async function attemptKey(c: Ctx, scope: string) {
  return sign(`auth:${scope}:${c.req.header('CF-Connecting-IP') ?? 'local'}`, c.env.SESSION_SECRET);
}
async function checkLock(c: Ctx, scope: string) {
  const row = await c.env.DB.prepare('SELECT locked_until FROM login_attempts WHERE key=?')
    .bind(await attemptKey(c, scope))
    .first<{ locked_until: number }>();
  if (row && row.locked_until > Date.now()) {
    c.header('Retry-After', String(Math.ceil((row.locked_until - Date.now()) / 1000)));
    return false;
  }
  return true;
}
async function recordAttempt(c: Ctx, scope: string, limit = 5) {
  const t = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO login_attempts(key,failures,window_start,locked_until) VALUES(?,1,?,0)
     ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,
     window_start=CASE WHEN window_start<? THEN ? ELSE window_start END,
     locked_until=CASE WHEN window_start>=? AND failures+1>=? THEN ? ELSE 0 END`,
  )
    .bind(await attemptKey(c, scope), t, t - 900000, t - 900000, t, t - 900000, limit, t + 900000)
    .run();
}
const locked = (c: Ctx) => fail(c, 'LOCKED', 'Too many attempts. Try again in 15 minutes.', 429);

routes.get('/auth/status', async (c) => {
  const owner = await c.env.DB.prepare('SELECT email FROM users WHERE id=1').first<{
    email: string | null;
  }>();
  const session = await readSession(c);
  return c.json({
    needs_setup: !owner,
    legacy_owner: !!owner && owner.email === null,
    registration_open: !!owner?.email,
    authenticated: !!session,
    user: session?.user ?? null,
  } satisfies AuthStatus);
});

routes.post('/auth/setup', async (c) => {
  if (!(await checkLock(c, 'setup'))) return locked(c);
  const body = registrationInput.parse(await c.req.json());
  if (await c.env.DB.prepare('SELECT id FROM users WHERE id=1').first())
    return fail(c, 'SETUP_COMPLETE', 'The owner account is already configured', 409);
  await recordAttempt(c, 'setup');
  const stamp = now();
  await c.env.DB.prepare(
    "INSERT INTO users(id,name,email,role,password_hash,created_at,last_login_at) VALUES(1,?,?,'admin',?,?,?)",
  )
    .bind(body.name, body.email, await hashPassword(body.password), stamp, stamp)
    .run();
  await createSession(c, 1);
  return c.json({ ok: true }, 201);
});

routes.post('/auth/register', async (c) => {
  if (!(await checkLock(c, 'register'))) return locked(c);
  const body = registrationInput.parse(await c.req.json());
  const owner = await c.env.DB.prepare('SELECT email FROM users WHERE id=1').first<{
    email: string | null;
  }>();
  if (!owner?.email)
    return fail(
      c,
      'SETUP_REQUIRED',
      'The owner must finish account setup before registration opens.',
      409,
    );
  await recordAttempt(c, 'register');
  const stamp = now();
  // User creation and private default categories commit together. No owner data is copied.
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users(name,email,role,password_hash,created_at,last_login_at) VALUES(?,?,'user',?,?,?)",
    ).bind(body.name, body.email, await hashPassword(body.password), stamp, stamp),
    c.env.DB.prepare(
      `INSERT INTO categories(id,user_id,name,type,created_at)
       SELECT u.id||':'||json_extract(d.value,'$[0]'),u.id,
         json_extract(d.value,'$[1]'),json_extract(d.value,'$[2]'),?
       FROM users u,json_each(?) d WHERE u.email=?`,
    ).bind(stamp, JSON.stringify(defaults), body.email),
  ]);
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email=?')
    .bind(body.email)
    .first<{ id: number }>();
  await createSession(c, user!.id);
  return c.json({ ok: true }, 201);
});

routes.post('/auth/login', async (c) => {
  const body = loginInput.parse(await c.req.json());
  const scope = `login:${body.email ?? 'legacy-owner'}`;
  if (!(await checkLock(c, scope)) || !(await checkLock(c, 'login-ip'))) return locked(c);
  await recordAttempt(c, 'login-ip', 30);
  const user = await c.env.DB.prepare(
    body.email
      ? 'SELECT id,password_hash FROM users WHERE email=?'
      : 'SELECT id,password_hash FROM users WHERE id=1 AND email IS NULL',
  )
    .bind(...(body.email ? [body.email] : []))
    .first<{ id: number; password_hash: string }>();
  // Unknown emails perform the same expensive password work as known accounts.
  const dummy = `pbkdf2-chain-sha256$6$100000$${'0'.repeat(48)}$${'0'.repeat(64)}`;
  const valid = await verifyPassword(body.password, user?.password_hash ?? dummy);
  if (!user || !valid) {
    await recordAttempt(c, scope);
    return fail(c, 'INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM login_attempts WHERE key=?').bind(await attemptKey(c, scope)),
    c.env.DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(now(), user.id),
  ]);
  await createSession(c, user.id);
  return c.json({ ok: true });
});

routes.post('/auth/profile', async (c) => {
  const body = profileInput.parse(await c.req.json());
  const user = c.get('user');
  if (user.id !== 1 || user.email !== null)
    return fail(c, 'PROFILE_COMPLETE', 'Your account already has a login email', 409);
  const result = await c.env.DB.prepare(
    'UPDATE users SET name=?,email=? WHERE id=? AND email IS NULL',
  )
    .bind(body.name, body.email, user.id)
    .run();
  if (!result.meta.changes)
    return fail(c, 'PROFILE_COMPLETE', 'Your account already has a login email', 409);
  return c.json({ ok: true });
});

routes.post('/auth/logout', async (c) => {
  empty.parse(await c.req.json());
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=? AND user_id=?')
    .bind(c.get('session'), c.get('user').id)
    .run();
  clearSession(c);
  return c.json({ ok: true });
});
routes.post('/auth/logout-all', async (c) => {
  empty.parse(await c.req.json());
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('user').id).run();
  clearSession(c);
  return c.json({ ok: true });
});
routes.post('/auth/password', async (c) => {
  const id = c.get('user').id,
    scope = `password:${id}`;
  if (!(await checkLock(c, scope))) return locked(c);
  const body = passwordChangeInput.parse(await c.req.json());
  const user = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?')
    .bind(id)
    .first<{ password_hash: string }>();
  if (!user || !(await verifyPassword(body.current_password, user.password_hash))) {
    await recordAttempt(c, scope);
    return fail(c, 'INVALID_CREDENTIALS', 'Current password is incorrect', 401);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(
      await hashPassword(body.new_password),
      id,
    ),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM login_attempts WHERE key=?').bind(await attemptKey(c, scope)),
  ]);
  await createSession(c, id);
  return c.json({ ok: true });
});

routes.get('/admin/users', async (c) => {
  if (c.get('user').role !== 'admin')
    return fail(c, 'FORBIDDEN', 'Administrator access is required', 403);
  const q = listQuery
    .extend({ search: z.string().trim().max(120).default('') })
    .parse(c.req.query());
  const search = q.search.toLowerCase(),
    t = Math.floor(Date.now() / 1000);
  const where = "instr(lower(name),?)>0 OR instr(lower(COALESCE(email,'')),?)>0";
  const [list, count, stats] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT ${fields},(SELECT COUNT(*) FROM sessions s WHERE s.user_id=users.id
        AND s.expires_at>? AND s.absolute_expires_at>?) AS active_sessions
       FROM users WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    ).bind(t, t, search, search, q.limit, (q.page - 1) * q.limit),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM users WHERE ${where}`).bind(search, search),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS users,SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins,
       (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE expires_at>? AND absolute_expires_at>?) AS signed_in_users FROM users`,
    ).bind(t, t),
  ]);
  return c.json({
    data: list.results,
    total: count.results[0].total,
    page: q.page,
    limit: q.limit,
    stats: stats.results[0],
  });
});

export default routes;
