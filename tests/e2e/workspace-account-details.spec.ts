import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import type { Account, AuthStatus } from '@folio/shared';

test('account details show scoped history, balances, goals and account actions', async ({
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
    name: 'Account Details',
    email: `account-details-${Date.now()}@example.test`,
    password: 'local account details password',
  });
  const savings = await post<Account>('/accounts', {
    name: 'Holiday savings',
    type: 'savings',
    opening_balance: 50000,
  });
  const bank = await post<Account>('/accounts', {
    name: 'Other bank',
    type: 'bank',
    opening_balance: 10000,
  });
  for (const extra of [
    { date: '2026-11-01', amount: 30000, note: 'Groceries' },
    {
      date: '2026-11-02',
      type: 'income',
      category_id: 'cat_salary',
      amount: 10000,
      note: 'Monthly income',
    },
    {
      date: '2026-11-03',
      type: 'transfer',
      category_id: null,
      to_account_id: bank.id,
      amount: 5000,
      note: 'Sent to bank',
    },
    {
      date: '2026-11-04',
      type: 'transfer',
      category_id: null,
      account_id: bank.id,
      to_account_id: savings.id,
      amount: 2500,
      note: 'Received from bank',
    },
    { date: '2026-11-01', account_id: bank.id, amount: 1000, note: 'Unrelated expense' },
  ])
    await post('/transactions', {
      type: 'expense',
      account_id: savings.id,
      category_id: 'cat_food',
      ...extra,
    });
  await post('/goals', {
    name: 'Summer holiday',
    account_id: savings.id,
    target_amount: 100000,
    target_date: '2099-01-01',
  });

  await page.goto('/accounts');
  await page.getByRole('link', { name: 'Holiday savings', exact: true }).click();
  await expect(page).toHaveURL(`/accounts/${savings.id}`);
  await expect(page.getByRole('heading', { name: 'Holiday savings', exact: true })).toBeVisible();
  const balance = page.locator('.account-detail-balance > strong');
  const metric = (label: string) =>
    page.locator('.account-activity-metrics .metric').filter({ hasText: label }).locator('strong');
  const row = (note: string) => page.getByRole('row').filter({ hasText: note });
  await expect(balance).toHaveText('₹275.00');
  await expect(metric('Total income')).toHaveText('₹100.00');
  await expect(metric('Total expenses')).toHaveText('₹300.00');
  await expect(metric('Transfers received')).toHaveText('₹25.00');
  await expect(metric('Transfers sent')).toHaveText('₹50.00');
  await expect(page.getByLabel('Filter by account')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(row('Unrelated expense')).toHaveCount(0);
  await expect(row('Received from bank')).toContainText('Transfer in');
  await expect(row('Received from bank').getByRole('cell').nth(4)).toHaveText('+₹25.00');
  await expect(row('Received from bank').getByRole('cell').nth(5)).toHaveText(
    'Holiday savings: ₹250.00',
  );
  await expect(row('Received from bank').getByRole('cell').nth(6)).toHaveText(
    'Holiday savings: ₹275.00',
  );
  await expect(row('Sent to bank')).toContainText('Transfer out');
  await expect(row('Sent to bank').getByRole('cell').nth(4)).toHaveText('−₹50.00');
  await expect(row('Groceries').getByRole('cell').nth(5)).toHaveText('Holiday savings: ₹500.00');
  await expect(row('Groceries').getByRole('cell').nth(6)).toHaveText('Holiday savings: ₹200.00');
  await expect(page.locator('.account-linked-goals')).toContainText('Summer holiday');
  await expect(
    page.getByRole('button', { name: 'Delete Holiday savings', exact: true }),
  ).toBeDisabled();
  const exported = page.waitForResponse((response) =>
    response.url().includes('/export/transactions.csv'),
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await exported;
  expect(new URL(csv.url()).searchParams.get('account_id')).toBe(savings.id);
  expect(csv.ok()).toBe(true);
  const downloaded = await downloading;
  const content = await readFile((await downloaded.path())!, 'utf8');
  expect(content).toContain('Received from bank');
  expect(content).not.toContain('Unrelated expense');
  await page.getByLabel('Search transactions').fill('Groceries');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(balance).toHaveText('₹275.00');
  await expect(row('Groceries').getByRole('cell').nth(6)).toHaveText('Holiday savings: ₹200.00');
  await page.getByLabel('Search transactions').fill('');
  await page.getByLabel('From date').fill('2026-11-03');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('From date').fill('');
  await page.getByLabel('Filter by type').selectOption('expense');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Filter by type').selectOption('');

  await row('Groceries')
    .getByRole('button', { name: 'View details for Groceries', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Edit transaction', exact: true })
    .click();
  await page.getByLabel('Amount', { exact: true }).fill('350');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(balance).toHaveText('₹225.00');
  await expect(metric('Total expenses')).toHaveText('₹350.00');
  await expect(row('Received from bank').getByRole('cell').nth(6)).toHaveText(
    'Holiday savings: ₹225.00',
  );

  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Account', exact: true }),
  ).toHaveValue('Holiday savings');
  await page.getByLabel('Amount', { exact: true }).fill('10');
  await page.getByLabel('Note', { exact: true }).fill('Added from account');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add transaction', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(balance).toHaveText('₹215.00');
  await expect(row('Added from account')).toBeVisible();
  await row('Added from account').getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete permanently', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(balance).toHaveText('₹225.00');

  await page.getByRole('button', { name: 'Edit Holiday savings', exact: true }).click();
  await page.getByLabel('Opening balance', { exact: true }).fill('600');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(balance).toHaveText('₹325.00');
  await expect(row('Groceries').getByRole('cell').nth(5)).toHaveText('Holiday savings: ₹600.00');
  await page.reload();
  await expect(balance).toHaveText('₹325.00');
  await mkdir('.local/qa', { recursive: true });
  await page.screenshot({
    path: '.local/qa/account-details-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/qa/account-details-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Archive Holiday savings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Restore Holiday savings', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Restore Holiday savings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All accounts', exact: true }).click();
  await page.getByRole('link', { name: 'View Other bank details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Other bank', exact: true })).toBeVisible();
  await expect(row('Groceries')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.goto('/accounts/missing-account');
  await expect(page.getByRole('heading', { name: 'Account not found', exact: true })).toBeVisible();
});
