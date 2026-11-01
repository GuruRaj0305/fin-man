import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Miniflare } from 'miniflare';
import type { Account, Dataset, Goal } from '@folio/shared';
import { applyMigrations, testDatabase } from './database';
import { client, ownerCredentials } from './client';

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
  const bank = (name: string, type = 'bank') =>
    user.data<Account>('/accounts', 'POST', { name, type });
  return { user, bank };
}

it('rejects deleting an account with transactions even when its balance is zero or it is archived', async () => {
  const { user, bank } = await setup();
  const account = await bank('Used bank');
  for (const type of ['income', 'expense'])
    await user.data('/transactions', 'POST', {
      date: '2026-11-01',
      type,
      amount: 10000,
      account_id: account.id,
      category_id: type === 'income' ? 'cat_salary' : 'cat_food',
    });
  const before = await user.data<Dataset>('/snapshot');
  const rejected = await user.request(`/accounts/${account.id}`, 'DELETE');
  expect(rejected.status).toBe(409);
  expect(await rejected.text()).toContain('Archive it instead');
  expect(await user.data<Dataset>('/snapshot')).toEqual(before);
  await user.data(`/accounts/${account.id}`, 'PUT', {
    name: account.name,
    type: account.type,
    archived: true,
  });
  expect((await user.request(`/accounts/${account.id}`, 'DELETE')).status).toBe(409);
  expect((await user.data<Dataset>('/snapshot')).transactions).toEqual(before.transactions);
});

it('protects both transfer accounts and permits deleting an unused account', async () => {
  const { user, bank } = await setup();
  const source = await bank('Source'),
    destination = await bank('Destination'),
    unused = await bank('Unused');
  await user.data('/transactions', 'POST', {
    date: '2026-11-01',
    type: 'transfer',
    amount: 10000,
    account_id: source.id,
    to_account_id: destination.id,
  });
  for (const account of [source, destination]) {
    const response = await user.request(`/accounts/${account.id}`, 'DELETE');
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('has transactions');
  }
  await user.data(`/accounts/${unused.id}`, 'DELETE');
  const remaining = await user.data<Dataset>('/snapshot');
  expect(remaining.accounts.map((account) => account.id)).toEqual([source.id, destination.id]);
  expect(remaining.transactions).toHaveLength(1);
});

it('protects a savings account until its goal is unlinked', async () => {
  const { user, bank } = await setup();
  const savings = await bank('Savings', 'savings');
  const goalInput = {
    name: 'Holiday',
    target_amount: 100000,
    target_date: '2099-01-01',
    account_id: savings.id,
  };
  const goal = await user.data<Goal>('/goals', 'POST', goalInput);
  const rejected = await user.request(`/accounts/${savings.id}`, 'DELETE');
  expect(rejected.status).toBe(409);
  expect(await rejected.text()).toContain('linked to a savings goal');
  await user.data(`/goals/${goal.id}`, 'PUT', { ...goalInput, account_id: null });
  await user.data(`/accounts/${savings.id}`, 'DELETE');
  const remaining = await user.data<Dataset>('/snapshot');
  expect(remaining.accounts).toEqual([]);
  expect(remaining.goals[0]).toMatchObject({ id: goal.id, account_id: null });
});
