import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Account, AuthStatus } from '@folio/shared';

test('transaction rows and details show historical balances for expenses, income and transfers', async ({
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
    name: 'Balance History',
    email: `balances-${Date.now()}@example.test`,
    password: 'local balance history password',
  });
  const bank = await post<Account>('/accounts', {
    name: 'Bank',
    type: 'bank',
    opening_balance: 50000,
  });
  const wallet = await post<Account>('/accounts', {
    name: 'Wallet',
    type: 'cash',
    opening_balance: 10000,
  });
  for (const extra of [
    { date: '2026-11-01', amount: 30000, note: 'Household spending' },
    {
      date: '2026-11-02',
      type: 'income',
      amount: 10000,
      category_id: 'cat_salary',
      note: 'Monthly income',
    },
    {
      date: '2026-11-03',
      type: 'transfer',
      amount: 5000,
      category_id: null,
      to_account_id: wallet.id,
      note: 'Wallet top-up',
    },
  ])
    await post('/transactions', {
      type: 'expense',
      account_id: bank.id,
      category_id: 'cat_food',
      ...extra,
    });
  await page.goto('/transactions');
  await expect(
    page.getByRole('columnheader', { name: 'Balance before', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Balance after', exact: true }),
  ).toBeVisible();
  const row = (note: string) => page.getByRole('row').filter({ hasText: note });
  await expect(row('Household spending').getByRole('cell').nth(4)).toContainText('−₹300.00');
  await expect(row('Household spending').getByRole('cell').nth(5)).toContainText('₹500.00');
  await expect(row('Household spending').getByRole('cell').nth(6)).toContainText('₹200.00');
  await expect(row('Monthly income').getByRole('cell').nth(5)).toContainText('₹200.00');
  await expect(row('Monthly income').getByRole('cell').nth(6)).toContainText('₹300.00');
  await expect(row('Wallet top-up').getByRole('cell').nth(5)).toContainText(
    'Bank: ₹300.00Wallet: ₹100.00',
  );
  await expect(row('Wallet top-up').getByRole('cell').nth(6)).toContainText(
    'Bank: ₹250.00Wallet: ₹150.00',
  );

  const search = page.getByRole('textbox', { name: 'Search transactions' });
  await search.fill('Monthly income');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row('Monthly income').getByRole('cell').nth(5)).toContainText('₹200.00');
  await expect(row('Monthly income').getByRole('cell').nth(6)).toContainText('₹300.00');
  await search.fill('');
  await expect(page.locator('tbody tr')).toHaveCount(3);

  const dialog = page.getByRole('dialog', { name: 'Transaction details' }),
    detail = (label: string) =>
      dialog
        .locator('dt')
        .filter({ hasText: new RegExp(`^${label}$`) })
        .locator('..')
        .locator('dd');
  await row('Household spending')
    .getByRole('button', { name: 'View details for Household spending' })
    .click();
  await expect(detail('Balance before')).toHaveText('₹500.00');
  await expect(detail('Balance after')).toHaveText('₹200.00');
  await dialog.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('350');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row('Monthly income').getByRole('cell').nth(5)).toContainText('₹150.00');
  await expect(row('Monthly income').getByRole('cell').nth(6)).toContainText('₹250.00');
  await expect(row('Wallet top-up').getByRole('cell').nth(5)).toContainText(
    'Bank: ₹250.00Wallet: ₹100.00',
  );
  await expect(row('Wallet top-up').getByRole('cell').nth(6)).toContainText(
    'Bank: ₹200.00Wallet: ₹150.00',
  );
  await row('Wallet top-up')
    .getByRole('button', { name: 'View details for Wallet top-up' })
    .click();
  await expect(detail('balance before')).toHaveText('₹250.00');
  await expect(detail('balance after')).toHaveText('₹200.00');
  await expect(detail('Receiving account balance before')).toHaveText('₹100.00');
  await expect(detail('Receiving account balance after')).toHaveText('₹150.00');
  await mkdir('.local/qa', { recursive: true });
  await dialog.screenshot({ path: '.local/qa/transaction-balances-desktop.png' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await row('Wallet top-up')
    .getByRole('button', { name: 'View transaction: Wallet top-up' })
    .click();
  await expect(detail('balance before')).toHaveText('₹250.00');
  await expect(detail('Receiving account balance after')).toHaveText('₹150.00');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.screenshot({ path: '.local/qa/transaction-balances-mobile.png' });
});
