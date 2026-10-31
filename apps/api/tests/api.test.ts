import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { applyMigrations } from './database';
import app from '../src/index';
import { hashPassword, verifyPassword } from '../src/auth';
import { tables } from '../src/data';
import type { Backup, Account, Transaction, Payment, Holding, Dataset } from '@folio/shared';

let mf: Miniflare,
  db: D1Database,
  cookie = '';
const secret = 'unit-test-secret-at-least-thirty-two-characters';
const env = () => ({
  DB: db,
  SESSION_SECRET: secret,
  APP_ORIGIN: 'http://localhost:5173',
  ENVIRONMENT: 'development',
});
const password = 'a very private password';
const ownerEmail = 'owner@example.test';
const ownerCredentials = { name: 'Owner', email: ownerEmail, password };
async function req(
  path: string,
  method = 'GET',
  body?: unknown,
  options: { cookie?: string; headers?: Record<string, string> } = {},
) {
  const response = await app.request(
    `http://localhost/api/v1${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Finance-Client': 'web',
        Origin: 'http://localhost:5173',
        Cookie: options.cookie ?? cookie,
        ...options.headers,
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
    },
    env(),
  );
  const set = response.headers.get('set-cookie');
  if (set && options.cookie === undefined) cookie = set.split(';')[0];
  return response;
}
async function json<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await req(path, method, body);
  expect(r.status, await r.clone().text()).toBeLessThan(300);
  return r.json() as Promise<T>;
}
async function setup() {
  await json('/auth/setup', 'POST', ownerCredentials);
}
async function bank(name = 'Checking', currency = 'INR') {
  return json<Account>('/accounts', 'POST', {
    name,
    type: 'bank',
    currency,
    opening_balance: 1000000,
  });
}
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2025-10-01',
    d1Databases: ['DB'],
  });
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  await applyMigrations(db);
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  cookie = '';
  await db.batch(
    [...tables]
      .reverse()
      .filter((t) => t !== 'categories')
      .map((t) => db.prepare(`DELETE FROM ${t}`))
      .concat([
        db.prepare('DELETE FROM sessions'),
        db.prepare('DELETE FROM users'),
        db.prepare('DELETE FROM login_attempts'),
        db.prepare("DELETE FROM categories WHERE user_id<>1 OR id NOT LIKE 'cat_%'"),
        db.prepare('UPDATE categories SET archived=0'),
      ]),
  );
});
describe('password hashing', () => {
  it('uses unique salts and verifies correct passwords', async () => {
    const a = await hashPassword(password),
      b = await hashPassword(password);
    expect(a).not.toBe(b);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword('wrong password value', a)).toBe(false);
    expect(await verifyPassword(password, 'broken')).toBe(false);
  });
});
describe('authentication and security', () => {
  it('allows setup exactly once and protects resources', async () => {
    expect((await req('/accounts')).status).toBe(401);
    expect(await json('/auth/status')).toEqual({
      needs_setup: true,
      authenticated: false,
      legacy_owner: false,
      registration_open: false,
      user: null,
    });
    await setup();
    expect((await req('/auth/setup', 'POST', ownerCredentials)).status).toBe(409);
    expect((await req('/accounts')).status).toBe(200);
    await json('/auth/logout', 'POST');
    expect((await req('/accounts')).status).toBe(401);
    await json('/auth/login', 'POST', { email: ownerEmail, password });
    expect((await req('/accounts')).status).toBe(200);
  });
  it('rejects cross-origin writes, missing CSRF header and invalid JSON inputs', async () => {
    expect(
      (await req('/auth/setup', 'POST', ownerCredentials, { headers: { 'X-Finance-Client': '' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await req('/auth/setup', 'POST', ownerCredentials, {
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect((await req('/auth/setup', 'POST', { password: 'short' })).status).toBe(400);
  });
  it('locks repeated login failures in D1 and permits login after timeout', async () => {
    await setup();
    for (let n = 0; n < 5; n++)
      expect(
        (await req('/auth/login', 'POST', { email: ownerEmail, password: 'incorrect password' }))
          .status,
      ).toBe(401);
    expect((await req('/auth/login', 'POST', { email: ownerEmail, password })).status).toBe(429);
    await db.prepare('UPDATE login_attempts SET locked_until=0,window_start=0').run();
    expect((await req('/auth/login', 'POST', { email: ownerEmail, password })).status).toBe(200);
  });
  it('signs cookies, rejects tampering and expires sessions', async () => {
    await setup();
    expect(cookie).toContain('folio_session=');
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a');
    expect((await req('/accounts', 'GET', undefined, { cookie: tampered })).status).toBe(401);
    await db.prepare('UPDATE sessions SET expires_at=0').run();
    expect((await req('/accounts')).status).toBe(401);
  });
  it('uses Secure, HttpOnly, Strict, host-only production cookies', async () => {
    const r = await app.request(
      'https://finance.example/api/v1/auth/setup',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Finance-Client': 'web',
          Origin: 'https://finance.example',
        },
        body: JSON.stringify(ownerCredentials),
      },
      { ...env(), ENVIRONMENT: 'production', APP_ORIGIN: 'https://finance.example' },
    );
    expect(r.status).toBe(201);
    const set = r.headers.get('set-cookie')!;
    for (const part of ['__Host-folio_session=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'])
      expect(set).toContain(part);
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
  });
  it('slides idle expiry and respects absolute expiry', async () => {
    await setup();
    const t = Math.floor(Date.now() / 1000);
    await db
      .prepare('UPDATE sessions SET expires_at=?,absolute_expires_at=?')
      .bind(t + 60, t + 5000)
      .run();
    expect((await req('/accounts')).status).toBe(200);
    const s = await db.prepare('SELECT expires_at FROM sessions').first<{ expires_at: number }>();
    expect(s?.expires_at).toBe(t + 5000);
    await db.prepare('UPDATE sessions SET absolute_expires_at=0').run();
    expect((await req('/accounts')).status).toBe(401);
  });
  it('changes password and revokes other sessions; logout everywhere revokes all', async () => {
    await setup();
    const first = cookie;
    await json('/auth/login', 'POST', { email: ownerEmail, password });
    await json('/auth/password', 'POST', {
      current_password: password,
      new_password: 'the next private password',
    });
    expect((await req('/accounts', 'GET', undefined, { cookie: first })).status).toBe(401);
    await json('/auth/logout-all', 'POST');
    expect((await req('/accounts')).status).toBe(401);
    expect((await req('/auth/login', 'POST', { email: ownerEmail, password })).status).toBe(401);
    expect(
      (
        await req('/auth/login', 'POST', {
          email: ownerEmail,
          password: 'the next private password',
        })
      ).status,
    ).toBe(200);
  });
});
describe('finance CRUD', () => {
  beforeEach(setup);
  it('creates, edits, archives and deletes accounts with integer amounts', async () => {
    const a = await bank();
    expect(
      (await req('/accounts', 'POST', { name: 'Invalid', type: 'cash', opening_balance: 1.2 }))
        .status,
    ).toBe(400);
    const { id, created_at, ...body } = a;
    void created_at;
    await json(`/accounts/${id}`, 'PUT', { ...body, name: 'Renamed', archived: true });
    const all = await json<{ data: Account[] }>('/accounts');
    expect(all.data[0].name).toBe('Renamed');
    expect(all.data[0].balance).toBe(1000000);
    await json(`/accounts/${id}`, 'DELETE');
    expect((await json<{ data: Account[] }>('/accounts')).data).toHaveLength(0);
  });
  it('handles income, expense, transfer, filters, pagination and reports', async () => {
    const a = await bank(),
      b = await bank('Savings');
    const tx = await json<Transaction>('/transactions', 'POST', {
      date: '2026-10-05',
      type: 'income',
      amount: 100000,
      account_id: a.id,
      category_id: 'cat_salary',
      note: 'Salary',
      tags: ['work'],
    });
    await json('/transactions', 'POST', {
      date: '2026-10-06',
      type: 'expense',
      amount: 25000,
      account_id: a.id,
      category_id: 'cat_food',
    });
    await json('/transactions', 'POST', {
      date: '2026-10-07',
      type: 'transfer',
      amount: 30000,
      account_id: a.id,
      to_account_id: b.id,
    });
    expect((await json<{ total: number }>('/transactions?search=work&limit=1')).total).toBe(1);
    expect(await (await req('/export/transactions.csv?search=work')).text()).toContain('Salary');
    const report = await json<{ income: number; expense: number }>(
      '/reports?year=2026&month=2026-10',
    );
    expect(report.income).toBe(100000);
    expect(report.expense).toBe(25000);
    const list = await json<{ data: Account[] }>('/accounts');
    expect(list.data.find((v) => v.id === a.id)?.balance).toBe(1045000);
    const { id, created_at, ...body } = tx;
    void created_at;
    await json(`/transactions/${id}`, 'PUT', { ...body, amount: 120000 });
    await json(`/transactions/${id}`, 'DELETE');
    expect((await req(`/accounts/${a.id}`, 'DELETE')).status).toBe(409);
  });
  it('rejects invalid dates, references, categories, currencies and self-transfers', async () => {
    const a = await bank(),
      b = await bank('USD account', 'USD');
    for (const extra of [
      { date: '2026-02-30' },
      { category_id: 'cat_salary' },
      { account_id: 'missing' },
    ])
      expect(
        (
          await req('/transactions', 'POST', {
            date: '2026-10-01',
            type: 'expense',
            amount: 100,
            account_id: a.id,
            category_id: 'cat_food',
            ...extra,
          })
        ).status,
      ).toBe(400);
    for (const target of [a.id, b.id])
      expect(
        (
          await req('/transactions', 'POST', {
            date: '2026-10-01',
            type: 'transfer',
            amount: 100,
            account_id: a.id,
            to_account_id: target,
          })
        ).status,
      ).toBe(400);
  });
  it('records loan EMIs, splits interest, recomputes after prepayment and prevents invalid edits', async () => {
    const source = await bank(),
      loan = await json<Account>('/loans', 'POST', {
        name: 'Car',
        principal: 10000000,
        rate_bps: 1200,
        tenure_months: 12,
        emi: 888488,
        start_date: '2026-01-01',
        lender: 'Bank',
      });
    const first = await json<Payment>(`/loans/${loan.id}/payments`, 'POST', {
      date: '2026-02-01',
      amount: 888488,
      kind: 'emi',
      account_id: source.id,
    });
    expect(first.interest).toBe(100000);
    expect(first.principal).toBe(788488);
    const pre = await json<Payment>(`/loans/${loan.id}/payments`, 'POST', {
      date: '2026-02-02',
      amount: 2000000,
      kind: 'prepayment',
      account_id: source.id,
    });
    expect(pre.interest).toBe(0);
    const detail = await json<{ outstanding: number; remaining_months: number }>(
      `/loans/${loan.id}`,
    );
    expect(detail.outstanding).toBe(7211512);
    expect(detail.remaining_months).toBeLessThan(11);
    expect((await req(`/transactions/${first.transaction_id}`, 'DELETE')).status).toBe(400);
    expect(
      (
        await req(`/loans/${loan.id}/payments`, 'POST', {
          date: '2026-01-05',
          amount: 5000,
          kind: 'emi',
          account_id: source.id,
        })
      ).status,
    ).toBe(400);
    await json(`/loans/${loan.id}/payments/${pre.id}`, 'DELETE');
  });
  it('tracks investment entries, valuations, returns and valuation history', async () => {
    const h = await json<Holding>('/investments', 'POST', {
      name: 'Index',
      asset_type: 'mutual_fund',
    });
    await json(`/investments/${h.id}/entries`, 'POST', {
      date: '2025-01-01',
      kind: 'buy',
      amount: 100000,
    });
    await json(`/investments/${h.id}/valuations`, 'POST', { date: '2026-01-01', value: 120000 });
    const v = await json<{ profit: number; return_pct: number; xirr: number }>(
      `/investments/${h.id}`,
    );
    expect(v.profit).toBe(20000);
    expect(v.return_pct).toBe(20);
    expect(v.xirr).toBeCloseTo(0.2, 6);
    await json(`/investments/${h.id}`, 'DELETE');
    expect((await json<Dataset>('/snapshot')).investment_entries).toHaveLength(0);
  });
  it('supports categories, budgets, linked and manual savings goals', async () => {
    const c = await json<CategoryRecord>('/categories', 'POST', {
      name: 'Garden',
      type: 'expense',
    });
    await json('/budgets', 'POST', { category_id: c.id, month: '2026-10', amount: 10000 });
    const goal = await json<{ id: string }>('/goals', 'POST', {
      name: 'Holiday',
      target_amount: 100000,
      target_date: '2027-10-01',
    });
    await json(`/goals/${goal.id}/contributions`, 'POST', { date: '2026-10-01', amount: 25000 });
    const view = await json<{ goals: { saved: number; percent: number }[]; budgets: unknown[] }>(
      '/overview?month=2026-10&today=2026-10-21',
    );
    expect(view.goals[0].saved).toBe(25000);
    expect(view.goals[0].percent).toBe(25);
    expect(view.budgets).toHaveLength(1);
    await json(`/goals/${goal.id}`, 'DELETE');
    expect((await json<Dataset>('/snapshot')).contributions).toHaveLength(0);
  });
  it('exports a credential-free backup and atomically imports replace or merge', async () => {
    await bank();
    const backup = await json<Backup>('/export');
    expect(JSON.stringify(backup)).not.toContain('password');
    await bank('Second');
    await json('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup });
    expect((await json<Dataset>('/snapshot')).accounts).toHaveLength(1);
    await bank('Third');
    await json('/import', 'POST', { mode: 'merge', confirmation: 'MERGE', backup });
    expect((await json<Dataset>('/snapshot')).accounts).toHaveLength(2);
    expect(
      (await req('/import', 'POST', { mode: 'replace', confirmation: 'MERGE', backup })).status,
    ).toBe(400);
    const invalid = structuredClone(backup);
    invalid.data.accounts.push({ ...invalid.data.accounts[0] });
    expect(
      (await req('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup: invalid }))
        .status,
    ).toBe(400);
    expect((await json<Dataset>('/snapshot')).accounts).toHaveLength(2);
  });
  it('round-trips a backup larger than 4,000 records without partial imports', async () => {
    const a = await bank();
    const backup = await json<Backup>('/export');
    backup.data.transactions = Array.from({ length: 4500 }, (_, i) => ({
      id: `bulk_${i}`,
      created_at: '2026-10-01T00:00:00.000Z',
      date: '2026-10-01',
      type: 'expense',
      amount: 1,
      account_id: a.id,
      to_account_id: null,
      category_id: 'cat_food',
      note: `Entry ${i}`,
      tags: ['bulk'],
    }));
    await json('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup });
    const exported = await json<Backup>('/export');
    expect(exported.data.transactions).toHaveLength(4500);
    expect(exported.data.transactions[4499].tags).toEqual(['bulk']);
    await json('/import', 'POST', { mode: 'merge', confirmation: 'MERGE', backup: exported });
    expect((await json<{ data: Account[] }>('/accounts')).data[0].balance).toBe(995500);
  });
  it('prevents concurrent overpayments without leaving an orphan expense', async () => {
    const source = await bank(),
      loan = await json<Account>('/loans', 'POST', {
        name: 'Concurrent loan',
        principal: 100000,
        rate_bps: 1200,
        tenure_months: 12,
        emi: 8885,
        start_date: '2026-01-01',
      });
    const body = { date: '2026-02-01', amount: 70000, kind: 'prepayment', account_id: source.id };
    const results = await Promise.all([
      req(`/loans/${loan.id}/payments`, 'POST', body),
      req(`/loans/${loan.id}/payments`, 'POST', body),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400 || r.status === 409)).toHaveLength(1);
    const data = await json<Dataset>('/snapshot');
    expect(data.loan_payments).toHaveLength(1);
    expect(data.transactions).toHaveLength(1);
  });
  it('imports CSV mapped transactions atomically and escapes exported formulas', async () => {
    const a = await bank();
    await json('/import/csv', 'POST', {
      confirmation: 'IMPORT',
      transactions: [
        {
          date: '2026-10-01',
          type: 'expense',
          amount: 12345,
          account_id: a.id,
          category_id: 'cat_food',
          note: '=HYPERLINK("evil")',
        },
      ],
    });
    const csv = await req('/export/transactions.csv');
    expect(csv.headers.get('Content-Type')).toContain('text/csv');
    expect(await csv.text()).toContain("'=HYPERLINK");
    const bad = await req('/import/csv', 'POST', {
      confirmation: 'IMPORT',
      transactions: [
        {
          date: '2026-10-01',
          type: 'expense',
          amount: 12345,
          account_id: 'missing',
          category_id: 'cat_food',
        },
      ],
    });
    expect(bad.status).toBe(400);
    expect((await json<Dataset>('/snapshot')).transactions).toHaveLength(1);
  });
});
type CategoryRecord = { id: string; name: string; type: string };
