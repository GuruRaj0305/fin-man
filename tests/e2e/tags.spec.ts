import { expect, test } from '@playwright/test';
import type { Account, AuthStatus, Dataset } from '@folio/shared';

test('tag autocomplete searches the backend with debounce, cancellation and a scoped cache', async ({
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
    name: 'Backend Tags',
    email: `backend-tags-${Date.now()}@example.test`,
    password: 'local backend tag test password',
  });
  const bank = await post<Account>('/accounts', { name: 'Tags bank', type: 'bank' });
  await post('/transactions', {
    date: '2026-11-01',
    type: 'expense',
    amount: 100,
    account_id: bank.id,
    category_id: 'cat_food',
    tags: ['Bangalore', 'Home'],
  });
  // Suggestions must work even when transaction history is absent from the client snapshot.
  await page.route('**/api/v1/snapshot', async (route) => {
    const response = await route.fetch();
    const data: Dataset = await response.json();
    await route.fulfill({ response, json: { ...data, transactions: [] } });
  });
  const searches: URL[] = [],
    cancelled: string[] = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/tags')
      cancelled.push(new URL(request.url()).searchParams.get('search') ?? '');
  });
  await page.route('**/api/v1/tags?**', async (route) => {
    const url = new URL(route.request().url());
    searches.push(url);
    if (url.searchParams.get('search') === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route
        .fulfill({ json: { data: [{ tag: 'Obsolete result', similar: false }] } })
        .catch(() => {});
    } else if (url.searchParams.get('search') === 'broken')
      await route.fulfill({ status: 503, json: { error: { message: 'Tags unavailable' } } });
    else await route.continue();
  });
  await page.goto('/transactions');
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const tags = page.getByRole('combobox', { name: 'Tags (comma separated)', exact: true }),
    list = page.getByRole('listbox', { name: 'Saved tags' }),
    dialog = page.getByRole('dialog');
  await tags.fill('b');
  await page.waitForTimeout(100);
  await tags.fill('bang');
  await page.waitForTimeout(100);
  expect(searches).toHaveLength(0);
  await tags.fill('bangaluru');
  await expect(list.getByText('Bangalore', { exact: true })).toBeVisible();
  expect(searches.map((url) => url.searchParams.get('search'))).toEqual(['bangaluru']);

  await tags.fill('home');
  await expect(list.getByText('Home', { exact: true })).toBeVisible();
  const beforeCachedSearch = searches.length;
  await tags.fill('bangaluru');
  await expect(list.getByText('Bangalore', { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  expect(searches).toHaveLength(beforeCachedSearch);

  await tags.fill('slow');
  await expect.poll(() => searches.at(-1)?.searchParams.get('search')).toBe('slow');
  await tags.fill('home');
  await expect(list.getByText('Home', { exact: true })).toBeVisible();
  await expect.poll(() => cancelled).toContain('slow');
  await page.waitForTimeout(1000);
  await expect(list.getByText('Obsolete result', { exact: true })).toHaveCount(0);
  await expect(list.getByText('Home', { exact: true })).toBeVisible();

  await tags.fill('broken');
  await expect(list.getByRole('alert')).toContainText('Could not load saved tags');
  await expect(tags).toHaveValue('broken');
  await tags.fill('home');
  await expect(list.getByText('Home', { exact: true })).toBeVisible();
  await tags.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(list).not.toBeVisible();
  await tags.press('ArrowDown');
  await expect(list.getByText('Home', { exact: true })).toBeVisible();
  await tags.press('Enter');
  await expect(tags).toHaveValue('Home, ');

  await tags.fill('Home, ban');
  await expect(list.getByText('Bangalore', { exact: true })).toBeVisible();
  expect(searches.at(-1)?.searchParams.getAll('exclude')).toEqual(['home']);
  await expect(list.getByRole('option', { name: 'Home', exact: true })).toHaveCount(0);
  await list.getByText('Bangalore', { exact: true }).click();
  await expect(tags).toHaveValue('Home, Bangalore, ');
  // The server resolves capitalization even when no suggestion is selected for the final input.
  await tags.fill('HOME, home, BANGALORE');
  await page.getByLabel('Amount', { exact: true }).fill('25.50');
  await page.getByLabel('Note', { exact: true }).fill('Backend tag verification');
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const snapshot: Dataset = await (await page.request.get('/api/v1/snapshot')).json();
  expect(snapshot.transactions.find((t) => t.note === 'Backend tag verification')?.tags).toEqual([
    'Home',
    'Bangalore',
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Quick add transaction', exact: true }).click();
  await tags.fill('bangaluru');
  await expect(list.getByText('Bangalore', { exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
