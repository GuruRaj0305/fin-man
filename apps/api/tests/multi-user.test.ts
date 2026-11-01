import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import type { Miniflare } from 'miniflare';
import type {
  AuthStatus,
  Dataset,
  Backup,
  Category,
  Account,
  Holding,
  UserMonitor,
  Payment,
} from '@folio/shared';
import { applyMigrations, testDatabase } from './database';
import { client, ownerCredentials, memberCredentials } from './client';

let mf: Miniflare, db: D1Database;
beforeEach(async () => {
  ({ mf, db } = await testDatabase());
  await applyMigrations(db);
});
afterEach(async () => {
  await mf?.dispose();
});
async function accounts() {
  const owner = client(db),
    member = client(db);
  await owner.data('/auth/setup', 'POST', ownerCredentials);
  await member.data('/auth/register', 'POST', memberCredentials);
  return { owner, member };
}
const bankInput = { name: 'Private checking', type: 'bank', opening_balance: 100000 };

describe('multi-user accounts and administration', () => {
  it('lets users create and delete their own unused categories, including defaults', async () => {
    const { owner, member } = await accounts();
    const input = { name: 'My custom category', type: 'expense' };
    const ownerCategory = await owner.data<Category>('/categories', 'POST', input);
    const memberCategory = await member.data<Category>('/categories', 'POST', input);
    expect(ownerCategory.id).not.toBe(memberCategory.id);
    expect(
      (await member.data<Dataset>('/snapshot')).categories.some((c) => c.id === ownerCategory.id),
    ).toBe(false);
    expect((await member.request(`/categories/${ownerCategory.id}`, 'DELETE')).status).toBe(404);
    expect(
      (
        await member.request(`/categories/${ownerCategory.id}`, 'PUT', {
          ...input,
          name: 'Changed',
        })
      ).status,
    ).toBe(404);
    await member.data(`/categories/${memberCategory.id}`, 'DELETE');
    expect(
      (await member.data<Dataset>('/snapshot')).categories.some((c) => c.id === memberCategory.id),
    ).toBe(false);
    expect(
      (await owner.data<Dataset>('/snapshot')).categories.find((c) => c.id === ownerCategory.id)
        ?.name,
    ).toBe(input.name);
    await member.data('/categories/cat_food', 'DELETE');
    expect(
      (await member.data<Dataset>('/snapshot')).categories.some((c) => c.id === 'cat_food'),
    ).toBe(false);
    expect(
      (await owner.data<Dataset>('/snapshot')).categories.some((c) => c.id === 'cat_food'),
    ).toBe(true);
  });

  it('preserves transaction and budget history when categories are in use', async () => {
    const { owner } = await accounts();
    const bank = await owner.data<Account>('/accounts', 'POST', bankInput);
    const category = await owner.data<Category>('/categories', 'POST', {
      name: 'Used category',
      type: 'expense',
    });
    await owner.data('/transactions', 'POST', {
      date: '2026-11-01',
      type: 'expense',
      amount: 1234,
      account_id: bank.id,
      category_id: category.id,
    });
    const before = await owner.data<Dataset>('/snapshot');
    const rejected = await owner.request(`/categories/${category.id}`, 'DELETE');
    expect(rejected.status).toBe(409);
    expect(await rejected.text()).toContain('Archive');
    expect(await owner.data<Dataset>('/snapshot')).toEqual(before);
    await owner.data(`/categories/${category.id}`, 'PUT', {
      name: category.name,
      type: category.type,
      archived: true,
    });
    expect((await owner.data<Dataset>('/snapshot')).transactions).toEqual(before.transactions);
    const budgetCategory = await owner.data<Category>('/categories', 'POST', {
      name: 'Planned category',
      type: 'expense',
    });
    const budget = await owner.data<{ id: string }>('/budgets', 'POST', {
      category_id: budgetCategory.id,
      month: '2026-11',
      amount: 10000,
    });
    expect((await owner.request(`/categories/${budgetCategory.id}`, 'DELETE')).status).toBe(409);
    expect((await owner.data<Dataset>('/snapshot')).budgets).toHaveLength(1);
    await owner.data(`/budgets/${budget.id}`, 'DELETE');
    await owner.data(`/categories/${budgetCategory.id}`, 'DELETE');
    expect(
      (await owner.data<Dataset>('/snapshot')).categories.some((c) => c.id === budgetCategory.id),
    ).toBe(false);
  });

  it('creates a duplicate-email signup atomically under concurrent requests', async () => {
    const owner = client(db);
    await owner.data('/auth/setup', 'POST', ownerCredentials);
    const results = await Promise.all([
      client(db).request('/auth/register', 'POST', memberCredentials),
      client(db).request('/auth/register', 'POST', memberCredentials),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const list = await owner.data<UserMonitor>('/admin/users');
    expect(list.total).toBe(2);
    const member = list.data.find((user) => user.email === memberCredentials.email)!;
    expect(
      await db
        .prepare('SELECT COUNT(*) AS count FROM categories WHERE user_id=?')
        .bind(member.id)
        .first('count'),
    ).toBe(14);
  });
  it('registers ordinary users, normalizes email, rejects role injection and enforces admin access', async () => {
    const { owner, member } = await accounts();
    expect((await client(db).request('/admin/users')).status).toBe(401);
    expect((await member.request('/admin/users')).status).toBe(403);
    const status = await member.data<AuthStatus>('/auth/status');
    expect(status.user).toMatchObject({
      name: memberCredentials.name,
      email: memberCredentials.email,
      role: 'user',
    });
    expect((await member.data<Dataset>('/snapshot')).accounts).toEqual([]);
    expect((await member.data<Dataset>('/snapshot')).categories).toHaveLength(14);
    expect(
      (
        await client(db).request('/auth/register', 'POST', {
          ...memberCredentials,
          email: 'other@example.test',
          role: 'admin',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client(db).request('/auth/register', 'POST', {
          ...memberCredentials,
          email: ' MEMBER@EXAMPLE.TEST ',
        })
      ).status,
    ).toBe(409);
    const monitor = await owner.data<UserMonitor>('/admin/users');
    expect(monitor.stats).toEqual({ users: 2, admins: 1, signed_in_users: 2 });
    expect(Object.keys(monitor.data[0]).sort()).toEqual(
      ['id', 'name', 'email', 'role', 'created_at', 'last_login_at', 'active_sessions'].sort(),
    );
    expect(JSON.stringify(monitor)).not.toMatch(/password|token_hash|SESSION_SECRET/);
    const login = client(db);
    expect(
      (
        await login.request('/auth/login', 'POST', {
          email: ' MEMBER@EXAMPLE.TEST ',
          password: memberCredentials.password,
        })
      ).status,
    ).toBe(200);
    expect(
      (await login.request('/auth/login', 'POST', { password: memberCredentials.password })).status,
    ).toBe(401);
  });

  it('isolates finance reads, references, updates, deletes, reports and exports', async () => {
    const { owner, member } = await accounts();
    const account = await owner.data<Account>('/accounts', 'POST', bankInput);
    const holding = await owner.data<Holding>('/investments', 'POST', {
      name: 'Owner holding',
      asset_type: 'mutual_fund',
    });
    const entry = await owner.data<{ id: string }>(`/investments/${holding.id}/entries`, 'POST', {
      date: '2026-10-01',
      kind: 'buy',
      amount: 100,
    });
    const goal = await owner.data<{ id: string }>('/goals', 'POST', {
      name: 'Owner goal',
      target_amount: 1000,
      target_date: '2027-01-01',
    });
    const contribution = await owner.data<{ id: string }>(
      `/goals/${goal.id}/contributions`,
      'POST',
      { date: '2026-10-01', amount: 100 },
    );
    await owner.data('/transactions', 'POST', {
      date: '2026-10-01',
      type: 'income',
      amount: 100,
      account_id: account.id,
      category_id: 'cat_salary',
      note: 'Owner-only income',
    });
    const snapshot = await member.data<Dataset>('/snapshot');
    for (const table of [
      'accounts',
      'transactions',
      'holdings',
      'investment_entries',
      'goals',
      'contributions',
    ] as const)
      expect(snapshot[table]).toEqual([]);
    const report = await member.data<{ income: number; expense: number }>('/reports?year=2026');
    expect(report).toMatchObject({ income: 0, expense: 0 });
    expect(
      JSON.stringify(await member.data('/overview?month=2026-10&today=2026-10-31')),
    ).not.toContain('Owner-only');
    expect(JSON.stringify(await member.data<Backup>('/export'))).not.toContain(account.id);
    expect(await (await member.request('/export/transactions.csv')).text()).not.toContain(
      'Owner-only',
    );
    expect((await member.request(`/accounts/${account.id}`, 'PUT', bankInput)).status).toBe(404);
    expect((await member.request(`/accounts/${account.id}`, 'DELETE')).status).toBe(404);
    expect((await member.request(`/investments/${holding.id}/entries`)).status).toBe(404);
    expect(
      (await member.request(`/investments/${holding.id}/entries/${entry.id}`, 'DELETE')).status,
    ).toBe(404);
    expect(
      (await member.request(`/goals/${goal.id}/contributions/${contribution.id}`, 'DELETE')).status,
    ).toBe(404);
    expect(
      (
        await member.request(`/investments/${holding.id}/entries`, 'POST', {
          date: '2026-10-01',
          kind: 'buy',
          amount: 100,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await member.request('/transactions', 'POST', {
          date: '2026-10-01',
          type: 'expense',
          amount: 1,
          account_id: account.id,
          category_id: 'cat_food',
        })
      ).status,
    ).toBe(400);
    expect((await member.request('/accounts', 'POST', { ...bankInput, user_id: 1 })).status).toBe(
      400,
    );
    expect((await owner.data<Dataset>('/snapshot')).accounts[0].id).toBe(account.id);
  });

  it('imports identical portable IDs into separate accounts and scopes replace and merge', async () => {
    const { owner, member } = await accounts();
    const source = await owner.data<Account>('/accounts', 'POST', bankInput);
    const loan = await owner.data<Account>('/loans', 'POST', {
      name: 'Loan',
      principal: 100000,
      rate_bps: 1200,
      tenure_months: 12,
      emi: 8885,
      start_date: '2026-01-01',
    });
    const payment = await owner.data<Payment>(`/loans/${loan.id}/payments`, 'POST', {
      date: '2026-02-01',
      kind: 'prepayment',
      amount: 1000,
      account_id: source.id,
    });
    const backup = await owner.data<Backup>('/export');
    await member.data('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup });
    expect((await member.data<Backup>('/export')).data).toEqual(backup.data);
    await member.data(`/accounts/${source.id}`, 'PUT', { ...bankInput, name: 'Member-only name' });
    expect(
      (await owner.data<Dataset>('/snapshot')).accounts.find((a) => a.id === source.id)?.name,
    ).toBe(bankInput.name);
    await member.data(`/loans/${loan.id}/payments/${payment.id}`, 'DELETE');
    expect((await member.data<Dataset>('/snapshot')).loan_payments).toHaveLength(0);
    expect((await owner.data<Dataset>('/snapshot')).loan_payments).toHaveLength(1);
    await member.data('/import', 'POST', { mode: 'merge', confirmation: 'MERGE', backup });
    expect((await member.data<Dataset>('/snapshot')).loan_payments).toHaveLength(1);
    await member.data('/import/csv', 'POST', {
      confirmation: 'IMPORT',
      transactions: [
        {
          date: '2026-10-01',
          type: 'expense',
          amount: 1,
          account_id: source.id,
          category_id: 'cat_food',
        },
      ],
    });
    expect((await owner.data<Dataset>('/snapshot')).transactions).toHaveLength(1);
    await member.data('/import', 'POST', {
      mode: 'replace',
      confirmation: 'REPLACE',
      backup: {
        ...backup,
        data: { ...backup.data, transactions: [], loan_payments: [], accounts: [] },
      },
    });
    expect((await member.data<Dataset>('/snapshot')).accounts).toHaveLength(0);
    expect((await owner.data<Dataset>('/snapshot')).accounts).toHaveLength(2);
  });

  it('scopes password changes and logout everywhere to the current user', async () => {
    const { owner, member } = await accounts(),
      oldMember = client(db, member.cookie);
    await member.data('/auth/password', 'POST', {
      current_password: memberCredentials.password,
      new_password: 'a changed member password',
    });
    expect((await oldMember.request('/snapshot')).status).toBe(401);
    expect((await owner.request('/snapshot')).status).toBe(200);
    expect((await member.request('/snapshot')).status).toBe(200);
    await member.data('/auth/logout-all', 'POST');
    expect((await member.request('/snapshot')).status).toBe(401);
    expect((await owner.request('/snapshot')).status).toBe(200);
    expect(
      (
        await member.request('/auth/login', 'POST', {
          email: memberCredentials.email,
          password: memberCredentials.password,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await member.request('/auth/login', 'POST', {
          email: memberCredentials.email,
          password: 'a changed member password',
        })
      ).status,
    ).toBe(200);
  });

  it('paginates and searches the monitor and counts only unexpired sessions', async () => {
    const { owner, member } = await accounts(),
      second = client(db);
    await second.data('/auth/login', 'POST', {
      email: memberCredentials.email,
      password: memberCredentials.password,
    });
    const list = await owner.data<UserMonitor>('/admin/users?search=MEMBER&limit=1');
    expect(list.total).toBe(1);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ email: memberCredentials.email, active_sessions: 2 });
    const memberId = (await member.data<AuthStatus>('/auth/status')).user!.id;
    await db
      .prepare('UPDATE sessions SET absolute_expires_at=0 WHERE user_id=?')
      .bind(memberId)
      .run();
    const expired = await owner.data<UserMonitor>('/admin/users?search=member');
    expect(expired.data[0].active_sessions).toBe(0);
    expect(expired.stats.signed_in_users).toBe(1);
    expect((await owner.data<UserMonitor>('/admin/users?page=2&limit=1')).data).toHaveLength(1);
    expect((await owner.request('/admin/users?limit=1001')).status).toBe(400);
  });

  it('blocks cross-workspace references and ownership changes in the database itself', async () => {
    const { owner, member } = await accounts();
    const account = await owner.data<Account>('/accounts', 'POST', bankInput);
    const memberId = (await member.data<AuthStatus>('/auth/status')).user!.id;
    await expect(
      db.prepare('UPDATE accounts SET user_id=? WHERE id=?').bind(memberId, account.id).run(),
    ).rejects.toThrow(/ownership/);
    await expect(
      db
        .prepare(
          "INSERT INTO transactions(id,user_id,date,type,amount,account_id,category_id,created_at) VALUES(?,?,'2026-10-01','expense',1,?,'cat_food','2026-10-01T00:00:00Z')",
        )
        .bind(`${memberId}:forged`, memberId, account.id)
        .run(),
    ).rejects.toThrow(/workspace reference/);
    await expect(
      db
        .prepare(
          "INSERT INTO accounts(id,user_id,name,type,opening_balance,created_at) VALUES(?,?,'Forged','bank',1,'2026-10-01T00:00:00Z') ON CONFLICT(id) DO UPDATE SET name=excluded.name",
        )
        .bind(account.id, memberId)
        .run(),
    ).rejects.toThrow(/ownership/);
  });

  it('limits registration and keeps login lockouts separate between accounts', async () => {
    const { owner, member } = await accounts();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await member.request('/auth/login', 'POST', {
            email: memberCredentials.email,
            password: 'incorrect member password',
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await member.request('/auth/login', 'POST', {
          email: memberCredentials.email,
          password: memberCredentials.password,
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await owner.request('/auth/login', 'POST', {
          email: ownerCredentials.email,
          password: ownerCredentials.password,
        })
      ).status,
    ).toBe(200);
    // Duplicate registrations count toward the public registration budget too.
    for (let i = 0; i < 4; i++)
      expect((await client(db).request('/auth/register', 'POST', memberCredentials)).status).toBe(
        409,
      );
    expect(
      (
        await client(db).request('/auth/register', 'POST', {
          ...memberCredentials,
          email: 'blocked@example.test',
        })
      ).status,
    ).toBe(429);
  });

  it('keeps registration closed until the owner account is initialized', async () => {
    expect((await client(db).request('/auth/register', 'POST', memberCredentials)).status).toBe(
      409,
    );
    expect(
      (await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>())?.count,
    ).toBe(0);
  });
});
