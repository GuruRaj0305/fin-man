import { beforeEach, afterEach, it, expect } from 'vitest';
import type { Miniflare } from 'miniflare';
import type { Account, Backup, Dataset, Holding } from '@folio/shared';
import { parseCsv } from '@folio/shared';
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

it('changes the workspace unit without changing money, history, loan allocations or references', async () => {
  const owner = client(db);
  await owner.data('/auth/setup', 'POST', ownerCredentials);
  const date = new Date().toISOString().slice(0, 10),
    month = date.slice(0, 7);
  const savings = await owner.data<Account>('/accounts', 'POST', {
    name: 'Savings',
    type: 'savings',
    opening_balance: 100000,
  });
  await owner.data('/accounts', 'POST', {
    name: 'Archived cash',
    type: 'cash',
    archived: true,
    opening_balance: 12345,
  });
  const loan = await owner.data<Account>('/loans', 'POST', {
    name: 'Loan',
    principal: 100000,
    rate_bps: 0,
    tenure_months: 10,
    emi: 10000,
    start_date: date,
  });
  await owner.data(`/loans/${loan.id}/payments`, 'POST', {
    date,
    kind: 'prepayment',
    amount: 5000,
    account_id: savings.id,
  });
  await owner.data('/transactions', 'POST', {
    date,
    type: 'income',
    amount: 45678,
    account_id: savings.id,
    category_id: 'cat_salary',
  });
  await owner.data('/transactions', 'POST', {
    date,
    type: 'expense',
    amount: 12345,
    account_id: savings.id,
    category_id: 'cat_food',
  });
  const holding = await owner.data<Holding>('/investments', 'POST', {
    name: 'Fund',
    asset_type: 'mutual_fund',
  });
  await owner.data(`/investments/${holding.id}/entries`, 'POST', {
    date,
    kind: 'buy',
    amount: 20000,
  });
  await owner.data(`/investments/${holding.id}/valuations`, 'POST', { date, value: 25000 });
  await owner.data('/goals', 'POST', {
    name: 'Savings goal',
    target_amount: 500000,
    target_date: '2099-01-01',
    account_id: savings.id,
  });
  await owner.data('/budgets', 'POST', { category_id: 'cat_food', month, amount: 30000 });
  const before = await owner.data<Dataset>('/snapshot');
  const overviewPath = `/overview?month=${month}&today=${date}`;
  const viewBefore = await owner.data<Record<string, unknown>>(overviewPath);
  const reportPath = `/reports?year=${date.slice(0, 4)}&month=${month}`;
  const reportBefore = await owner.data<Record<string, unknown>>(reportPath);
  await owner.data('/settings/currency', 'PUT', { currency: 'GBP' });
  const after = await owner.data<Dataset>('/snapshot');
  expect(after).toEqual({
    ...before,
    currency: 'GBP',
    accounts: before.accounts.map((a) => ({ ...a, currency: 'GBP' })),
  });
  const viewAfter = await owner.data<Record<string, unknown>>(overviewPath);
  for (const field of [
    'net_worth',
    'income',
    'expense',
    'loan_outstanding',
    'investment_value',
    'history',
    'goals',
    'budgets',
  ])
    expect(viewAfter[field]).toEqual(viewBefore[field]);
  expect(viewAfter.currency).toBe('GBP');
  expect(await owner.data(reportPath)).toEqual({ ...reportBefore, currency: 'GBP' });
  const exportedRows = parseCsv(await (await owner.request('/export/transactions.csv')).text());
  expect(exportedRows.slice(1).map((row) => row[3])).toEqual(['GBP', 'GBP', 'GBP']);
  const next = await owner.data<Account>('/accounts', 'POST', { name: 'New bank', type: 'bank' });
  expect(next.currency).toBe('GBP');
  const nextLoan = await owner.data<Account>('/loans', 'POST', {
    name: 'New loan',
    principal: 10000,
    rate_bps: 0,
    tenure_months: 10,
    emi: 1000,
    start_date: date,
  });
  expect(nextLoan.currency).toBe('GBP');
  expect(
    (
      await owner.request('/accounts', 'POST', {
        name: 'Wrong currency',
        type: 'bank',
        currency: 'USD',
      })
    ).status,
  ).toBe(400);
});

it('persists currency per user and rejects unauthenticated or invalid changes', async () => {
  const owner = client(db),
    member = client(db);
  await owner.data('/auth/setup', 'POST', ownerCredentials);
  await member.data('/auth/register', 'POST', memberCredentials);
  await owner.data('/accounts', 'POST', { name: 'Owner bank', type: 'bank', opening_balance: 100 });
  await member.data('/accounts', 'POST', {
    name: 'Member bank',
    type: 'bank',
    opening_balance: 200,
  });
  expect((await client(db).request('/settings/currency', 'PUT', { currency: 'USD' })).status).toBe(
    401,
  );
  for (const currency of ['JPY', 'KWD', 'ABC', 'usd', ''])
    expect((await owner.request('/settings/currency', 'PUT', { currency })).status).toBe(400);
  expect(
    (await owner.request('/settings/currency', 'PUT', { currency: 'USD', user_id: 2 })).status,
  ).toBe(400);
  await owner.data('/settings/currency', 'PUT', { currency: 'USD' });
  const memberData = await member.data<Dataset>('/snapshot');
  expect(memberData.currency).toBe('INR');
  expect(memberData.accounts[0]).toMatchObject({ currency: 'INR', opening_balance: 200 });
  const freshSession = client(db);
  await freshSession.data('/auth/login', 'POST', {
    email: ownerCredentials.email,
    password: ownerCredentials.password,
  });
  expect((await freshSession.data<Dataset>('/snapshot')).currency).toBe('USD');
});

it('round-trips currency in backups and keeps the current currency when merging', async () => {
  const owner = client(db);
  await owner.data('/auth/setup', 'POST', ownerCredentials);
  await owner.data('/settings/currency', 'PUT', { currency: 'EUR' });
  await owner.data('/accounts', 'POST', { name: 'Bank', type: 'bank', opening_balance: 12345 });
  const backup = await owner.data<Backup>('/export');
  expect(backup.data.currency).toBe('EUR');
  await owner.data('/settings/currency', 'PUT', { currency: 'USD' });
  await owner.data('/import', 'POST', { mode: 'merge', confirmation: 'MERGE', backup });
  expect((await owner.data<Dataset>('/snapshot')).accounts[0]).toMatchObject({
    currency: 'USD',
    opening_balance: 12345,
  });
  expect((await owner.data<Dataset>('/snapshot')).currency).toBe('USD');
  await owner.data('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup });
  expect(await owner.data<Dataset>('/snapshot')).toEqual(backup.data);
  const legacy = JSON.parse(JSON.stringify(backup));
  delete legacy.data.currency;
  legacy.data.accounts.forEach((account: Account) => {
    account.currency = 'INR';
  });
  await owner.data('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup: legacy });
  expect((await owner.data<Dataset>('/snapshot')).currency).toBe('INR');
});
