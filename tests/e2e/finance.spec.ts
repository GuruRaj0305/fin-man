import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { localDate, formatMoney } from '../../packages/shared/src/calculations';
import type { Dataset } from '@folio/shared';
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
async function chooseChoice(page: Page, label: string, text: string) {
  await page.getByRole('combobox', { name: label, exact: true }).fill(text);
  await page
    .getByRole('listbox', { name: label, exact: true })
    .getByRole('option', { name: text, exact: true })
    .click();
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
    await chooseChoice(page, 'Category', category);
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

test('one saved currency updates all screens and forms while preserving amounts', async ({
  page,
}) => {
  await login(page);
  const before: Dataset = await (await page.request.get('/api/v1/snapshot')).json();
  const month = localDate().slice(0, 7);
  const viewBefore = await (
    await page.request.get(`/api/v1/overview?month=${month}&today=${localDate()}`)
  ).json();
  await page.goto('/settings');
  await expect(page.getByLabel('Currency', { exact: true })).toHaveCount(1);
  await page.getByLabel('Currency', { exact: true }).selectOption('USD');
  await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Currency updated throughout your workspace. Amounts are unchanged.',
  );
  await page.reload();
  await expect(page.getByLabel('Currency', { exact: true })).toHaveValue('USD');
  const after: Dataset = await (await page.request.get('/api/v1/snapshot')).json();
  expect(after).toEqual({
    ...before,
    currency: 'USD',
    accounts: before.accounts.map((account) => ({ ...account, currency: 'USD' })),
  });
  await page.goto('/');
  await expect(page.locator('.net-worth-number')).toHaveText(
    formatMoney(viewBefore.net_worth, 'USD'),
  );
  await expect(page.locator('.donut-label strong')).toContainText('$');
  for (const route of [
    '/transactions',
    '/accounts',
    '/loans',
    '/investments',
    '/goals',
    '/budgets',
    '/reports',
  ]) {
    await page.goto(route);
    await page.getByRole('button', { name: 'Quick add transaction', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('.amount-input > span')).toHaveText('$');
    await expect(page.getByRole('dialog').getByLabel('Currency', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.main-content')).not.toContainText('₹');
  }
  await page.goto('/accounts?new=1');
  await expect(page.getByRole('dialog', { name: 'A new account', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Currency', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('.amount-input > span')).toHaveText('$');
  await page.keyboard.press('Escape');
  await page.goto('/loans');
  await page.getByRole('button', { name: 'Add loan', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Currency', { exact: true })).toHaveCount(0);
  for (const symbol of await page
    .getByRole('dialog')
    .locator('.amount-input > span')
    .allTextContents())
    expect(symbol).toBe('$');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByLabel('Currency', { exact: true }).selectOption('GBP');
  await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Currency updated');
  await page.getByRole('button', { name: 'Quick add transaction', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.amount-input > span')).toHaveText('£');
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: '.local/qa/currency-settings-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Currency', { exact: true }).selectOption('INR');
  await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Currency updated');
  expect(await (await page.request.get('/api/v1/snapshot')).json()).toEqual(before);
});

for (const width of [1440, 390]) {
  test(`searchable fields refresh in place and preserve drafts across creation tabs at ${width}px`, async ({
    page,
    context,
  }) => {
    await login(page);
    await page.setViewportSize({ width, height: 900 });
    const originalUrl = page.url();
    const note = `Retained draft ${width}`;
    await page.getByRole('button', { name: 'Quick add transaction', exact: true }).click();
    const submit = page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add transaction', exact: true });
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeVisible();
    await expect(submit).toBeDisabled();
    for (const invalidAmount of ['0', '-1', '0.001', '10000000001']) {
      await page.getByLabel('Amount', { exact: true }).fill(invalidAmount);
      await expect(submit).toBeDisabled();
    }
    await page.getByLabel('Amount', { exact: true }).fill('38.25');
    await expect(submit).toBeEnabled();
    await page.getByLabel('Note', { exact: true }).fill(note);
    await page.getByLabel('Tags (comma separated)', { exact: true }).fill('draft, retained');
    const date = await page.getByLabel('Date', { exact: true }).inputValue();
    await page.getByLabel('Date', { exact: true }).fill('');
    await expect(submit).toBeDisabled();
    await page.getByLabel('Date', { exact: true }).fill(date);
    await expect(submit).toBeEnabled();
    async function expectDraft() {
      await expect(page).toHaveURL(originalUrl);
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('38.25');
      await expect(page.getByLabel('Note', { exact: true })).toHaveValue(note);
      await expect(page.getByLabel('Tags (comma separated)', { exact: true })).toHaveValue(
        'draft, retained',
      );
      await expect(page.getByLabel('Date', { exact: true })).toHaveValue(date);
    }
    async function openCreation(button: string, title: string) {
      const opened = context.waitForEvent('page');
      await page.getByRole('dialog').getByRole('button', { name: button, exact: true }).click();
      const tab = await opened;
      await expect(tab.getByRole('dialog', { name: title, exact: true })).toBeVisible();
      expect(await tab.evaluate(() => window.opener === null)).toBe(true);
      await expect(page).toHaveURL(originalUrl);
      await expect(page.getByRole('dialog')).toBeVisible();
      return tab;
    }
    async function refresh(label = 'Refresh accounts', keyboard = false) {
      const fieldLabel = label === 'Refresh categories' ? 'Category' : 'Account';
      const search = page.getByRole('combobox', { name: fieldLabel, exact: true });
      await search.click();
      const query = await search.inputValue();
      const response = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/snapshot') && response.request().method() === 'GET',
      );
      const button = page.getByRole('button', { name: label, exact: true });
      if (keyboard) {
        await search.press('Tab');
        await expect(button).toBeFocused();
        await button.press('Enter');
      } else await button.click();
      expect((await response).status()).toBe(200);
      await expect(button).toBeEnabled();
      await expect(search).toBeFocused();
      await expect(search).toHaveValue(query);
      await expect(search).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('listbox', { name: fieldLabel, exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).not.toContainText('Accounts and categories updated.');
    }
    for (const [label, refreshLabel, addLabel] of [
      ['Account', 'Refresh accounts', 'Create account'],
      ['Category', 'Refresh categories', 'Create category'],
    ]) {
      const field = page
        .locator('.searchable-select')
        .filter({ has: page.getByRole('combobox', { name: label, exact: true }) });
      const refreshButton = field
        .locator('.searchable-select-control')
        .getByRole('button', { name: refreshLabel, exact: true });
      await expect(refreshButton).toHaveCount(0);
      await field.getByRole('combobox').click();
      await expect(refreshButton).toBeVisible();
      await expect(field.getByRole('button', { name: addLabel, exact: true })).toBeVisible();
      await page.getByLabel('Note', { exact: true }).click();
      await expect(refreshButton).toHaveCount(0);
    }
    await expect(
      page.locator('.dialog-actions').getByRole('button', { name: /Refresh/ }),
    ).toHaveCount(0);
    const categorySearch = page.getByRole('combobox', { name: 'Category', exact: true });
    await categorySearch.fill('no-matching-category-xyz');
    await refresh('Refresh categories');
    await expect(page.getByRole('listbox', { name: 'Category', exact: true })).toContainText(
      'No matches',
    );
    await expect(submit).toBeDisabled();
    expect(await categorySearch.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(
      false,
    );
    await expectDraft();
    await categorySearch.fill('rEn');
    await refresh('Refresh categories', true);
    await expect(page.getByRole('option', { name: 'Rent', exact: true })).toBeVisible();
    await page.getByRole('dialog').screenshot({
      path: `.local/qa/search-refresh-focused-${width}.png`,
      animations: 'disabled',
    });
    await categorySearch.press('Enter');
    await expect(submit).toBeEnabled();
    await expect(categorySearch).toHaveValue('Rent');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    const accountTab = await openCreation('Create account', 'A new account');
    await expect(accountTab).toHaveURL('http://localhost:5174/accounts?new=1');
    const accountName = `New tab account ${width}`;
    await accountTab.getByLabel('Account name', { exact: true }).fill(accountName);
    await finish(accountTab);
    await accountTab.close();
    const accountSearch = page.getByRole('combobox', { name: 'Account', exact: true });
    await accountSearch.fill(accountName);
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('listbox', { name: 'Account', exact: true })).toContainText(
      'No matches',
    );
    await refresh();
    await expect(page.getByRole('option', { name: accountName, exact: true })).toBeVisible();
    await expectDraft();
    await chooseChoice(page, 'Account', accountName);
    await expect(submit).toBeEnabled();
    const accountId = await page.locator('input[type=hidden][name=account_id]').inputValue();
    await page
      .getByRole('combobox', { name: 'Account', exact: true })
      .fill(accountName.toUpperCase());
    await expect(page.getByRole('option', { name: accountName, exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Account', exact: true }).press('Enter');
    if (width === 1440) {
      await page.route('**/api/v1/snapshot', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Lists are temporarily unavailable.' } }),
        }),
      );
      await accountSearch.click();
      await page.getByRole('button', { name: 'Refresh accounts', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
        'Lists are temporarily unavailable.',
      );
      await expect(accountSearch).toBeFocused();
      await expect(accountSearch).toHaveAttribute('aria-expanded', 'true');
      await expectDraft();
      await expect(page.locator('input[type=hidden][name=account_id]')).toHaveValue(accountId);
      await page.unroute('**/api/v1/snapshot');
      await refresh();
      await expectDraft();
    }
    await page.getByRole('dialog').getByRole('button', { name: 'income', exact: true }).click();
    const incomeTab = await openCreation('Create category', 'Add a category');
    await expect(incomeTab).toHaveURL('http://localhost:5174/settings?new-category=income');
    await expect(incomeTab.getByLabel('Type', { exact: true })).toHaveValue('income');
    const incomeName = `New tab income ${width}`;
    await incomeTab.getByLabel('Name', { exact: true }).fill(incomeName);
    await finish(incomeTab);
    await categorySearch.fill(incomeName);
    await refresh('Refresh categories');
    await expect(page.getByRole('option', { name: incomeName, exact: true })).toBeVisible();
    await expectDraft();
    await expect(page.locator('input[type=hidden][name=account_id]')).toHaveValue(accountId);
    await chooseChoice(page, 'Category', incomeName);
    await expect(submit).toBeEnabled();
    const incomeRow = incomeTab.locator('.category-setting').filter({ hasText: incomeName });
    await incomeRow.getByRole('button', { name: 'Delete', exact: true }).click();
    await finish(incomeTab, 'Delete permanently');
    await incomeTab.close();
    await refresh('Refresh categories');
    await expect(submit).toBeDisabled();
    await expectDraft();
    await page.getByRole('combobox', { name: 'Category', exact: true }).fill(incomeName);
    await expect(
      page.getByRole('listbox', { name: 'Category', exact: true }).getByRole('option'),
    ).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Category', exact: true }).press('Escape');
    await page.getByRole('dialog').getByRole('button', { name: 'expense', exact: true }).click();
    const expenseTab = await openCreation('Create category', 'Add a category');
    await expect(expenseTab.getByLabel('Type', { exact: true })).toHaveValue('expense');
    const expenseName = `New tab expense ${width}`;
    await expenseTab.getByLabel('Name', { exact: true }).fill(expenseName);
    await finish(expenseTab);
    await refresh('Refresh categories');
    await expectDraft();
    await expect(page.locator('input[type=hidden][name=account_id]')).toHaveValue(accountId);
    await chooseChoice(page, 'Category', expenseName);
    await expect(submit).toBeEnabled();
    const categoryId = await page.locator('input[type=hidden][name=category_id]').inputValue();
    await refresh();
    await expectDraft();
    await expect(page.locator('input[type=hidden][name=category_id]')).toHaveValue(categoryId);
    await page.getByRole('dialog').screenshot({
      path: `.local/qa/transaction-new-tabs-refresh-${width}.png`,
      animations: 'disabled',
    });
    await finish(page, 'Add transaction');
    const snapshot: Dataset = await (await page.request.get('/api/v1/snapshot')).json();
    expect(snapshot.transactions.find((transaction) => transaction.note === note)).toMatchObject({
      amount: 3825,
      date,
      tags: ['draft', 'retained'],
      account_id: accountId,
      category_id: categoryId,
    });
    await expenseTab.reload();
    const expenseRow = expenseTab.locator('.category-setting').filter({ hasText: expenseName });
    await expect(expenseRow.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await expenseRow.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(expenseRow).toContainText('archived');
    await expenseTab.close();
    await page.getByRole('button', { name: 'Quick add transaction', exact: true }).click();
    await refresh();
    await page.getByRole('combobox', { name: 'Category', exact: true }).fill(expenseName);
    await expect(
      page.getByRole('listbox', { name: 'Category', exact: true }).getByRole('option'),
    ).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Category', exact: true }).press('Escape');
    await page.getByRole('dialog').getByRole('button', { name: 'transfer', exact: true }).click();
    const destinationTab = await openCreation('Create destination account', 'A new account');
    await destinationTab.close();
    await expect(page.getByLabel('To account', { exact: true })).toBeVisible();
    await page.getByLabel('Amount', { exact: true }).fill('10');
    await expect(submit).toBeDisabled();
    const sourceName = await page
      .getByRole('combobox', { name: 'Account', exact: true })
      .inputValue();
    await chooseChoice(page, 'To account', sourceName);
    await expect(submit).toBeDisabled();
    await chooseChoice(page, 'To account', accountName);
    await expect(submit).toBeEnabled();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.goto('/transactions');
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(submit).toBeDisabled();
    await page.getByLabel('Note', { exact: true }).fill('Local transaction draft');
    await refresh();
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Local transaction draft');
  });
}
