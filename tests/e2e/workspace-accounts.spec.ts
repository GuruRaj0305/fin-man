import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Account, AuthStatus } from '@folio/shared';

test('account actions preserve used accounts and allow archiving, restoring and deleting unused accounts', async ({
  page,
}) => {
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const response = await page.request.post(`/api/v1${path}`, {
      headers: { 'X-Finance-Client': 'web' },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const status: AuthStatus = await (await page.request.get('/api/v1/auth/status')).json();
  await post(status.needs_setup ? '/auth/setup' : '/auth/register', {
    name: 'Account Actions',
    email: `accounts-${Date.now()}@example.test`,
    password: 'local account actions password',
  });
  const source = await post<Account>('/accounts', { name: 'Source', type: 'bank' }),
    destination = await post<Account>('/accounts', { name: 'Destination', type: 'bank' });
  await post('/accounts', { name: 'Unused', type: 'cash' });
  const savings = await post<Account>('/accounts', { name: 'Goal savings', type: 'savings' });
  await post('/goals', {
    name: 'Holiday',
    target_amount: 100000,
    target_date: '2099-01-01',
    account_id: savings.id,
  });
  await post('/transactions', {
    date: '2026-11-01',
    type: 'transfer',
    amount: 10000,
    account_id: source.id,
    to_account_id: destination.id,
  });
  await page.goto('/accounts');
  await mkdir('.local/qa', { recursive: true });
  const card = (name: string) =>
    page.locator('.account-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  for (const name of ['Source', 'Destination']) {
    await expect(
      card(name).getByRole('button', { name: `Delete ${name}`, exact: true }),
    ).toBeDisabled();
    await expect(
      card(name).getByRole('button', { name: `Delete ${name}`, exact: true }),
    ).toHaveAttribute('title', /has transactions/);
  }
  await expect(
    card('Goal savings').getByRole('button', { name: 'Delete Goal savings', exact: true }),
  ).toBeDisabled();
  await expect(
    card('Goal savings').getByRole('button', { name: 'Delete Goal savings', exact: true }),
  ).toHaveAttribute('title', /linked to a savings goal/);
  await expect(
    card('Source').getByRole('button', { name: 'Edit Source', exact: true }),
  ).toHaveAttribute('title', 'Edit account');
  await page.screenshot({
    path: '.local/qa/account-archive-toggle-desktop.png',
    animations: 'disabled',
  });
  await card('Source').getByRole('button', { name: 'Edit Source', exact: true }).click();
  await page.getByLabel('Account name', { exact: true }).fill('Source edited');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await card('Source edited')
    .getByRole('button', { name: 'Archive Source edited', exact: true })
    .click();
  await expect(card('Source edited')).toHaveCount(0);
  await page.getByLabel('Show archived accounts').check();
  await page.screenshot({
    path: '.local/qa/account-archive-toggle-on.png',
    animations: 'disabled',
  });
  await expect(card('Source edited')).toHaveClass(/archived/);
  await expect(
    card('Source edited').getByRole('button', { name: 'Delete Source edited', exact: true }),
  ).toBeDisabled();
  await expect(
    card('Source edited').getByRole('button', { name: 'Restore Source edited', exact: true }),
  ).toHaveAttribute('title', 'Restore account');
  await card('Source edited')
    .getByRole('button', { name: 'Restore Source edited', exact: true })
    .click();
  await expect(card('Source edited')).not.toHaveClass(/archived/);
  await expect(
    card('Unused').getByRole('button', { name: 'Delete Unused', exact: true }),
  ).toBeEnabled();
  await card('Unused').getByRole('button', { name: 'Delete Unused', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete permanently', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(card('Unused')).toHaveCount(0);
  for (const account of [source, destination]) {
    const rejected = await page.request.delete(`/api/v1/accounts/${account.id}`, {
      headers: { 'X-Finance-Client': 'web' },
      data: {},
    });
    expect(rejected.status()).toBe(409);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(
    card('Source edited').getByRole('button', { name: 'Delete Source edited', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/qa/account-archive-toggle-mobile.png',
    animations: 'disabled',
    fullPage: true,
  });
  await card('Source edited').screenshot({ path: '.local/qa/account-actions-mobile.png' });
});
