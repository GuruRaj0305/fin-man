import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { localDate } from '../../packages/shared/src/calculations';
const password = 'my local test password';
const ownerEmail = 'owner@example.test';
test.describe.configure({ mode: 'serial' });
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email address', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A little clarity. A lot of possibility.' }),
  ).toBeVisible();
}
async function finish(page: Page, name = 'Save changes') {
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
test('first run sets a password, signs out, and logs in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Test Owner');
  await page.getByLabel('Email address', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Create a password').fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create my workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'A little clarity. A lot of possibility.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little peace of mind.' })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A little clarity. A lot of possibility.' }),
  ).toBeVisible();
});
test('adds an account, income, expense, and verifies balance', async ({ page }) => {
  await login(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Accounts', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await page.getByLabel('Account name').fill('Everyday testing');
  await page.getByLabel('Opening balance').fill('10000');
  await finish(page);
  await expect(page.getByText('Everyday testing', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Transactions', exact: true })
    .click();
  for (const [type, amount, note, category] of [
    ['income', '5000', 'Test salary', 'Salary'],
    ['expense', '1200.50', 'Test groceries', 'Food'],
  ]) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: type, exact: true }).click();
    await page.getByLabel('Amount', { exact: true }).fill(amount);
    await page.getByLabel('Category', { exact: true }).selectOption({ label: category });
    await page.getByLabel('Note', { exact: true }).fill(note);
    await finish(page, 'Add transaction');
    await expect(page.getByText(note, { exact: true })).toBeVisible();
  }
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Accounts', exact: true })
    .click();
  await expect(page.getByText('₹13,799.50', { exact: true })).toBeVisible();
});
test('adds a loan and shows the amortization schedule and prepayment', async ({ page }) => {
  await login(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Loans', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add loan', exact: true }).click();
  await page.getByLabel('Account name').fill('Test car loan');
  await page.getByLabel('Principal', { exact: true }).fill('100000');
  await page.getByLabel('Annual interest rate (%)').fill('12');
  await page.getByLabel('Tenure (months)').fill('12');
  await finish(page);
  await page.getByRole('link', { name: 'Test car loan' }).click();
  await expect(
    page.getByRole('heading', { name: 'Amortization schedule', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Forecast', exact: true })).toHaveCount(12);
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel('Payment type').selectOption('prepayment');
  await page.getByLabel('Amount', { exact: true }).fill('10000');
  await page.getByLabel('Paid from').selectOption({ label: 'Everyday testing' });
  await finish(page, 'Record payment');
  await expect(page.getByRole('cell', { name: 'prepayment', exact: true })).toBeVisible();
});
test('adds an investment, buy entry and valuation showing 20% return', async ({ page }) => {
  await login(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Investments', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add investment', exact: true }).click();
  await page.getByLabel('Holding name').fill('Test index fund');
  await finish(page);
  await page.getByRole('link', { name: 'Test index fund' }).click();
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('10000');
  await finish(page, 'Add entry');
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await page.getByLabel('Current value', { exact: true }).fill('12000');
  await finish(page, 'Save valuation');
  await expect(page.getByTestId('investment-return')).toHaveText('20.0% return');
});
test('exports JSON, reimports it and maps a CSV', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Your data belongs to you' })).toBeVisible();
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  const file = await wait,
    path = await file.path();
  expect(path).toBeTruthy();
  const contents = await readFile(path!, 'utf8'),
    backup = JSON.parse(contents);
  expect(backup.data.accounts).toHaveLength(2);
  await page.getByLabel('Import JSON backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
  await page.getByLabel('Import method').selectOption('replace');
  await page.getByLabel('Type REPLACE to confirm').fill('REPLACE');
  await finish(page, 'Replace my finance data');
  await expect(page.getByRole('status')).toContainText('imported successfully');
  const csv = `date,type,amount,account,category,note\n${localDate()},expense,10.25,Everyday testing,Food,CSV tea`;
  await page
    .getByLabel('Import CSV transactions')
    .setInputFiles({ name: 'expenses.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Preview & validate' }).click();
  await page.getByLabel('Type IMPORT to confirm').fill('IMPORT');
  await finish(page, 'Import transactions');
  await expect(page.getByRole('status')).toContainText('Imported 1 transactions');
  await page.goto('/transactions');
  await expect(page.getByText('CSV tea', { exact: true })).toBeVisible();
});
test('mobile navigation, dark theme and offline read-only app shell', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Savings goals' })
    .click();
  await expect(page.getByRole('heading', { name: 'Good things start with a goal.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  await page.getByLabel('Goal name').fill('A test holiday');
  await page.getByLabel('Target amount').fill('50000');
  await page.getByLabel('Target date').fill('2027-12-31');
  await finish(page);
  await expect(page.getByRole('heading', { name: 'A test holiday', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A test holiday', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('read-only');
  await expect(page.getByRole('button', { name: 'Add goal', exact: true })).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText('Your app shell is available offline.', { exact: false }),
  ).toBeVisible();
  await context.setOffline(false);
});
test('budget warnings, reports and responsive visual review', async ({ page }) => {
  await login(page);
  await page.goto('/budgets');
  await page.getByRole('button', { name: 'Add budget', exact: true }).click();
  await page.getByLabel('Expense category').selectOption({ label: 'Food' });
  await page.getByLabel('Monthly limit').fill('1000');
  await finish(page);
  await expect(page.getByText('Over budget by', { exact: false })).toBeVisible();
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Category breakdown' })).toBeVisible();
  await page.getByRole('button', { name: 'Yearly', exact: true }).click();
  await expect(page.getByLabel('Report year')).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A little clarity. A lot of possibility.' }),
  ).toBeVisible();
  await expect(page.locator('.recharts-pie-sector')).toHaveCount(2);
  await mkdir('.local/qa', { recursive: true });
  await page.screenshot({
    path: '.local/qa/dashboard-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await page.screenshot({
    path: '.local/qa/dashboard-mobile-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('self-registration isolates workspaces and the admin monitor lists current users', async ({
  page,
  browser,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Admin monitor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Current users', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: ownerEmail })).toContainText(
    'Administrator',
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Second User');
  await page.getByLabel('Email address', { exact: true }).fill('second@example.test');
  await page.getByLabel('Create a password', { exact: true }).fill('second private test password');
  await page.getByLabel('Confirm password', { exact: true }).fill('second private test password');
  await page.getByRole('button', { name: 'Create my workspace', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A little clarity. A lot of possibility.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin monitor', exact: true })).toHaveCount(0);
  await page.goto('/accounts');
  await expect(page.getByText('Everyday testing', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await page.getByLabel('Account name').fill('Member private bank');
  await finish(page);
  await expect(page.getByText('Member private bank', { exact: true })).toBeVisible();
  await page.goto('/admin/users');
  await expect(page.getByRole('alert')).toContainText('Administrator access is required.');
  const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' });
  try {
    const admin = await adminContext.newPage();
    await login(admin);
    await admin.goto('/accounts');
    await expect(admin.getByText('Everyday testing', { exact: true })).toBeVisible();
    await expect(admin.getByText('Member private bank', { exact: true })).toHaveCount(0);
    await admin.getByRole('link', { name: 'Admin monitor', exact: true }).click();
    const row = admin.getByRole('row').filter({ hasText: 'second@example.test' });
    await expect(row).toContainText('Second User');
    await expect(row.getByRole('cell').nth(1)).toHaveText('User');
    await expect(row.getByRole('cell').last()).toHaveText('1');
    await admin.getByLabel('Search users').fill('second@example.test');
    await expect(admin.getByRole('row').filter({ hasText: ownerEmail })).toHaveCount(0);
    await admin.getByLabel('Search users').fill('');
    await expect(admin.getByRole('row').filter({ hasText: ownerEmail })).toBeVisible();
    await mkdir('.local/qa', { recursive: true });
    await admin.screenshot({
      path: '.local/qa/admin-users-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    await admin.setViewportSize({ width: 390, height: 844 });
    expect(
      await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await admin.screenshot({
      path: '.local/qa/admin-users-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
  } finally {
    await adminContext.close();
  }
});
