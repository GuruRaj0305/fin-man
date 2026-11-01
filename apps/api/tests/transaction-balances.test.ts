import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Miniflare } from 'miniflare';
import type { Account, Page, Transaction, TransactionWithBalances } from '@folio/shared';
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
async function workspace(credentials = ownerCredentials, setup = true) {
  const user = client(db);
  await user.data(setup ? '/auth/setup' : '/auth/register', 'POST', credentials);
  const bank = await user.data<Account>('/accounts', 'POST', {
    name: 'Bank',
    type: 'bank',
    opening_balance: 50000,
  });
  const wallet = await user.data<Account>('/accounts', 'POST', {
    name: 'Wallet',
    type: 'cash',
    opening_balance: 10000,
  });
  const input = {
    date: '2026-11-02',
    type: 'expense',
    amount: 30000,
    account_id: bank.id,
    category_id: 'cat_food',
  };
  return {
    user,
    bank,
    wallet,
    input,
    add: (extra: Record<string, unknown> = {}) =>
      user.data<Transaction>('/transactions', 'POST', { ...input, ...extra }),
    list: (query = '') => user.data<Page<TransactionWithBalances>>(`/transactions${query}`),
  };
}

it('calculates source and destination balances before filtering or pagination', async () => {
  const { bank, wallet, add, list } = await workspace();
  await add({ date: '2026-11-01', type: 'income', amount: 10000, category_id: 'cat_salary' });
  const expense = await add();
  const transfer = await add({
    date: '2026-11-03',
    type: 'transfer',
    category_id: null,
    to_account_id: wallet.id,
    amount: 10000,
  });
  const latest = await add({ date: '2026-11-04', amount: 5000, note: 'Search target' });
  await add({ date: '2099-01-01', type: 'income', amount: 99900, category_id: 'cat_salary' });
  const rows = await list();
  expect(rows.data.find((t) => t.id === expense.id)).toMatchObject({
    balance_before: 60000,
    balance_after: 30000,
    to_balance_before: null,
    to_balance_after: null,
  });
  expect(rows.data.find((t) => t.id === transfer.id)).toMatchObject({
    balance_before: 30000,
    balance_after: 20000,
    to_balance_before: 10000,
    to_balance_after: 20000,
  });
  for (const query of [
    '?from=2026-11-04&to=2026-11-04',
    '?search=Search%20target',
    '?category_id=cat_food&type=expense&from=2026-11-04',
    '?page=2&limit=1',
    `?account_id=${bank.id}&from=2026-11-04&to=2026-11-04`,
  ]) {
    expect((await list(query)).data[0]).toMatchObject({
      id: latest.id,
      balance_before: 20000,
      balance_after: 15000,
    });
  }
  expect((await list(`?account_id=${wallet.id}`)).data[0]).toMatchObject({
    id: transfer.id,
    to_balance_before: 10000,
    to_balance_after: 20000,
  });
});

it('recalculates after backdated entries, edits, deletions and opening-balance changes', async () => {
  const { user, bank, input, add, list } = await workspace();
  const expense = await add();
  expect((await list()).data[0]).toMatchObject({ balance_before: 50000, balance_after: 20000 });
  const earlier = await add({
    date: '2026-11-01',
    type: 'income',
    amount: 10000,
    category_id: 'cat_salary',
  });
  expect((await list()).data[0]).toMatchObject({
    id: expense.id,
    balance_before: 60000,
    balance_after: 30000,
  });
  await user.data(`/transactions/${earlier.id}`, 'PUT', {
    ...input,
    date: '2026-11-03',
    type: 'income',
    amount: 20000,
    category_id: 'cat_salary',
  });
  expect((await list()).data.find((t) => t.id === expense.id)).toMatchObject({
    balance_before: 50000,
    balance_after: 20000,
  });
  await user.data(`/transactions/${earlier.id}`, 'DELETE');
  await user.data(`/transactions/${expense.id}`, 'PUT', { ...input, amount: 35000 });
  expect((await list()).data[0]).toMatchObject({ balance_before: 50000, balance_after: 15000 });
  await user.data(`/accounts/${bank.id}`, 'PUT', {
    name: bank.name,
    type: bank.type,
    opening_balance: 70000,
    archived: true,
  });
  expect((await list()).data[0]).toMatchObject({ balance_before: 70000, balance_after: 35000 });
});

it('uses a stable order for identical dates and timestamps across pages', async () => {
  const { user, add, list } = await workspace();
  const first = await add({ amount: 10000 }),
    second = await add({ amount: 5000 });
  await db
    .prepare('UPDATE transactions SET created_at=? WHERE user_id=1')
    .bind('2026-11-01T00:00:00.000Z')
    .run();
  const ascending = [first, second].sort((a, b) => a.id.localeCompare(b.id));
  const rows = await list();
  expect(rows.data.map((t) => t.id)).toEqual(ascending.map((t) => t.id).reverse());
  expect((await list('?limit=1&page=1')).data[0]).toEqual(rows.data[0]);
  expect((await list('?limit=1&page=2')).data[0]).toEqual(rows.data[1]);
  expect(rows.data[1].balance_before).toBe(50000);
  expect(rows.data[0].balance_before).toBe(rows.data[1].balance_after);
  expect(rows.data[0].balance_after).toBe(35000);
  const backup = await user.data<{ data: { transactions: Record<string, unknown>[] } }>('/export');
  expect(backup.data.transactions[0]).not.toHaveProperty('balance_before');
});

it('includes the full loan payment and keeps workspace histories isolated', async () => {
  const { user, bank, list } = await workspace();
  const loan = await user.data<Account>('/loans', 'POST', {
    name: 'Loan',
    principal: 100000,
    rate_bps: 1200,
    tenure_months: 12,
    emi: 10000,
    start_date: '2026-11-01',
  });
  await user.data(`/loans/${loan.id}/payments`, 'POST', {
    date: '2026-11-02',
    amount: 10000,
    kind: 'emi',
    account_id: bank.id,
  });
  expect((await list()).data[0]).toMatchObject({
    amount: 10000,
    balance_before: 50000,
    balance_after: 40000,
  });
  const member = await workspace(memberCredentials, false);
  await member.add({ amount: 60000 });
  expect((await member.list()).data[0]).toMatchObject({
    balance_before: 50000,
    balance_after: -10000,
  });
  expect((await list()).data[0]).toMatchObject({ balance_before: 50000, balance_after: 40000 });
  expect((await member.list(`?account_id=${bank.id}`)).data).toEqual([]);
});
