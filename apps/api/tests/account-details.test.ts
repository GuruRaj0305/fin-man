import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Miniflare } from 'miniflare';
import type {
  Account,
  AccountDetail,
  Goal,
  Page,
  Transaction,
  TransactionWithBalances,
} from '@folio/shared';
import { applyMigrations, testDatabase } from './database';
import { client, memberCredentials, ownerCredentials } from './client';

let mf: Miniflare, db: D1Database;
beforeEach(async () => {
  ({ mf, db } = await testDatabase());
  await applyMigrations(db);
});
afterEach(async () => {
  await mf?.dispose();
});
async function setup() {
  const user = client(db);
  await user.data('/auth/setup', 'POST', ownerCredentials);
  const account = await user.data<Account>('/accounts', 'POST', {
    name: 'Savings',
    type: 'savings',
    opening_balance: 50000,
  });
  const other = await user.data<Account>('/accounts', 'POST', {
    name: 'Other savings',
    type: 'savings',
    opening_balance: 10000,
  });
  const input = {
    date: '2026-11-01',
    type: 'expense',
    amount: 30000,
    account_id: account.id,
    category_id: 'cat_food',
  };
  return {
    user,
    account,
    other,
    input,
    add: (extra: Record<string, unknown> = {}) =>
      user.data<Transaction>('/transactions', 'POST', { ...input, ...extra }),
    detail: () => user.data<AccountDetail>(`/accounts/${account.id}`),
  };
}

it('returns account totals and linked goals with both transfer directions, excluding unrelated activity', async () => {
  const { user, account, other, add, detail } = await setup();
  const expense = await add({ note: 'Groceries' });
  await add({ date: '2026-11-02', type: 'income', category_id: 'cat_salary', amount: 10000 });
  await add({
    date: '2026-11-03',
    type: 'transfer',
    category_id: null,
    to_account_id: other.id,
    amount: 5000,
  });
  const incoming = await add({
    date: '2026-11-04',
    type: 'transfer',
    category_id: null,
    account_id: other.id,
    to_account_id: account.id,
    amount: 2500,
  });
  await add({ account_id: other.id, amount: 1000, note: 'Unrelated expense' });
  const goal = await user.data<Goal>('/goals', 'POST', {
    name: 'Holiday',
    account_id: account.id,
    target_amount: 100000,
    target_date: '2099-01-01',
  });
  await user.data('/goals', 'POST', {
    name: 'Other goal',
    account_id: other.id,
    target_amount: 100000,
    target_date: '2099-01-01',
  });
  expect(await detail()).toMatchObject({
    account: {
      id: account.id,
      name: 'Savings',
      type: 'savings',
      opening_balance: 50000,
      balance: 27500,
      archived: false,
    },
    stats: {
      income: 10000,
      expense: 30000,
      transfer_in: 2500,
      transfer_out: 5000,
      transaction_count: 4,
    },
    goals: [goal],
    delete_reason: expect.stringContaining('has transactions'),
  });
  const page = await user.data<Page<TransactionWithBalances>>(
    `/transactions?account_id=${account.id}&limit=2`,
  );
  expect(page.total).toBe(4);
  expect(page.data[0]).toMatchObject({
    id: incoming.id,
    to_balance_before: 25000,
    to_balance_after: 27500,
  });
  const older = await user.data<Page<TransactionWithBalances>>(
    `/transactions?account_id=${account.id}&limit=2&page=2`,
  );
  expect(older.data[1]).toMatchObject({
    id: expense.id,
    balance_before: 50000,
    balance_after: 20000,
  });
  const filtered = await user.data<Page<TransactionWithBalances>>(
    `/transactions?account_id=${account.id}&search=Groceries&type=expense`,
  );
  expect(filtered.data.map((row) => row.id)).toEqual([expense.id]);
  const csv = await (
    await user.request(`/export/transactions.csv?account_id=${account.id}`)
  ).text();
  expect(csv).toContain('Groceries');
  expect(csv).not.toContain('Unrelated expense');
});

it('refreshes totals after edits and deletions, and keeps archived account history accessible', async () => {
  const { user, account, input, add, detail } = await setup();
  expect(await detail()).toMatchObject({
    account: { balance: 50000 },
    stats: { transaction_count: 0 },
    goals: [],
    delete_reason: null,
  });
  const transaction = await add();
  await user.data(`/transactions/${transaction.id}`, 'PUT', { ...input, amount: 35000 });
  expect(await detail()).toMatchObject({
    account: { balance: 15000 },
    stats: { expense: 35000, transaction_count: 1 },
  });
  await user.data(`/accounts/${account.id}`, 'PUT', {
    name: 'Renamed savings',
    type: account.type,
    opening_balance: 60000,
    archived: true,
  });
  expect(await detail()).toMatchObject({
    account: { name: 'Renamed savings', balance: 25000, archived: true },
    stats: { expense: 35000 },
  });
  expect(
    (await user.data<Page<Transaction>>(`/transactions?account_id=${account.id}`)).data,
  ).toHaveLength(1);
  await user.data(`/transactions/${transaction.id}`, 'DELETE');
  expect(await detail()).toMatchObject({
    account: { balance: 60000 },
    stats: { expense: 0, transaction_count: 0 },
    delete_reason: null,
  });
  await user.data(`/accounts/${account.id}`, 'PUT', {
    name: 'Renamed savings',
    type: account.type,
    opening_balance: 60000,
    archived: false,
  });
  const goal = await user.data<Goal>('/goals', 'POST', {
    name: 'Holiday',
    account_id: account.id,
    target_amount: 100000,
    target_date: '2099-01-01',
  });
  expect((await detail()).delete_reason).toContain('linked to a savings goal');
  await user.data(`/goals/${goal.id}`, 'DELETE');
  await user.data(`/accounts/${account.id}`, 'DELETE');
  expect((await user.request(`/accounts/${account.id}`)).status).toBe(404);
});

it('requires authentication and hides accounts belonging to another workspace', async () => {
  const { user, account, detail } = await setup();
  expect((await client(db).request(`/accounts/${account.id}`)).status).toBe(401);
  const member = client(db);
  await member.data('/auth/register', 'POST', memberCredentials);
  const privateAccount = await member.data<Account>('/accounts', 'POST', {
    name: 'Private',
    type: 'cash',
    opening_balance: 90000,
  });
  for (const id of [privateAccount.id, 'missing-account']) {
    const response = await user.request(`/accounts/${id}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { message: 'Account not found' } });
  }
  expect((await member.request(`/accounts/${account.id}`)).status).toBe(404);
  expect((await detail()).account.balance).toBe(50000);
});
