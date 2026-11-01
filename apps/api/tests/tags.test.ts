import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Miniflare } from 'miniflare';
import type { Account, Backup, TagSuggestions, Transaction } from '@folio/shared';
import { applyMigrations, testDatabase } from './database';
import { client, memberCredentials, ownerCredentials } from './client';

let mf: Miniflare, db: D1Database;
beforeEach(async () => {
  ({ mf, db } = await testDatabase());
  await applyMigrations(db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await mf?.dispose();
});

async function workspace(credentials = ownerCredentials, setup = true) {
  const user = client(db);
  await user.data(setup ? '/auth/setup' : '/auth/register', 'POST', credentials);
  const bank = await user.data<Account>('/accounts', 'POST', { name: 'Bank', type: 'bank' });
  const input = {
    date: '2026-11-01',
    type: 'expense',
    amount: 100,
    account_id: bank.id,
    category_id: 'cat_food',
  };
  return {
    user,
    input,
    add: (tags: string[]) => user.data<Transaction>('/transactions', 'POST', { ...input, tags }),
    search: (search: string, suffix = '') =>
      user.data<TagSuggestions>(`/tags?search=${encodeURIComponent(search)}${suffix}`),
  };
}

it('searches saved tags, ranks matches, resolves casing on writes and isolates workspaces', async () => {
  const owner = await workspace();
  await owner.add(['Bangalore', 'Home', 'Home repairs', 'Travel']);
  expect((await owner.add([' bangalore ', 'BANGALORE', 'home', ' HOME '])).tags).toEqual([
    'Bangalore',
    'Home',
  ]);
  expect((await owner.search('ban')).data).toEqual([{ tag: 'Bangalore', similar: false }]);
  expect((await owner.search('bangaluru')).data).toEqual([{ tag: 'Bangalore', similar: true }]);
  expect((await owner.search('repair')).data).toEqual([{ tag: 'Home repairs', similar: false }]);
  expect((await owner.search('home', '&exclude=HOME')).data).toEqual([
    { tag: 'Home repairs', similar: false },
  ]);
  const member = await workspace(memberCredentials, false);
  expect((await member.search('ban')).data).toEqual([]);
  await member.add(['Bangalore private']);
  expect((await owner.search('private')).data).toEqual([]);
  expect((await member.search('ban')).data).toEqual([{ tag: 'Bangalore private', similar: false }]);
  await owner.add(['50%_trip', 'goa "trip"']);
  expect((await owner.search('%_')).data).toEqual([]);
  expect((await owner.search('50%_')).data[0].tag).toBe('50%_trip');
  expect((await owner.search('"trip"')).data[0].tag).toBe('goa "trip"');
});

it('validates search bounds and requires a session', async () => {
  const { user } = await workspace();
  expect((await client(db).request('/tags?search=home')).status).toBe(401);
  for (const path of [
    '/tags?limit=0',
    '/tags?limit=21',
    '/tags?search=%00bangalore',
    `/tags?search=${'x'.repeat(41)}`,
    '/tags?user_id=2',
    `/tags?${Array.from({ length: 13 }, () => 'exclude=home').join('&')}`,
  ])
    expect((await user.request(path)).status, path).toBe(400);
});

it('keeps tag usage and search indexes correct across edits, deletes, CSV and backup imports', async () => {
  const { user, input, add, search } = await workspace();
  const first = await add(['Bangalore']),
    second = await add(['Bangalore', 'Home']);
  await user.data(`/transactions/${first.id}`, 'PUT', { ...input, tags: ['bangalore', 'Travel'] });
  expect(await db.prepare("SELECT uses FROM tags WHERE tag_key='bangalore'").first('uses')).toBe(2);
  await user.data(`/transactions/${first.id}`, 'DELETE');
  expect((await search('travel')).data).toEqual([]);
  expect((await search('ban')).data).toHaveLength(1);
  await user.data('/import/csv', 'POST', {
    confirmation: 'IMPORT',
    transactions: [{ ...input, tags: ['Imported'] }],
  });
  expect((await search('import')).data[0].tag).toBe('Imported');
  const backup = await user.data<Backup>('/export');
  await add(['Temporary']);
  await user.data('/import', 'POST', { mode: 'replace', confirmation: 'REPLACE', backup });
  expect((await search('temporary')).data).toEqual([]);
  expect((await search('import')).data[0].tag).toBe('Imported');
  await user.data('/import', 'POST', { mode: 'merge', confirmation: 'MERGE', backup });
  expect(await db.prepare("SELECT uses FROM tags WHERE tag_key='bangalore'").first('uses')).toBe(1);
  await user.data(`/transactions/${second.id}`, 'DELETE');
  expect((await search('ban')).data).toEqual([]);
  expect((await search('home')).data).toEqual([]);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('finds tags beyond an initial candidate page without reading transaction history', async () => {
  const { user, search } = await workspace();
  const tags = Array.from({ length: 10000 }, (_, i) => `project-${String(i).padStart(5, '0')}`);
  tags.push('zz-Bangalore');
  await db
    .prepare(
      'INSERT INTO tags(user_id,tag_key,name,uses) SELECT 1,lower(value),value,1 FROM json_each(?)',
    )
    .bind(JSON.stringify(tags))
    .run();
  const reads = vi.spyOn(db, 'prepare');
  expect((await search('project-09999')).data[0].tag).toBe('project-09999');
  expect((await search('zz-bangaluru')).data).toEqual([{ tag: 'zz-Bangalore', similar: true }]);
  expect((await user.data<TagSuggestions>('/tags?search=project&limit=20')).data).toHaveLength(20);
  expect(reads.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(
    /FROM transactions|json_each/,
  );
  const plan = await db
    .prepare(
      'EXPLAIN QUERY PLAN SELECT name FROM tags WHERE user_id=? AND tag_key>=? AND tag_key<? ORDER BY tag_key LIMIT ?',
    )
    .bind(1, 'project-09999', 'project-09999\u{10ffff}', 8)
    .all<{ detail: string }>();
  expect(plan.results.map((row) => row.detail).join('\n')).toContain('USING INDEX');
});

it('backfills legacy tags without changing transactions and counts repeated tags once', async () => {
  const legacy = await testDatabase();
  try {
    await applyMigrations(legacy.db, [
      '0001_initial.sql',
      '0002_loan_payment_guard.sql',
      '0003_multi_user.sql',
      '0004_workspace_currency.sql',
    ]);
    const owner = client(legacy.db);
    await owner.data('/auth/setup', 'POST', ownerCredentials);
    await legacy.db
      .prepare(
        "INSERT INTO accounts(id,name,type,opening_balance,created_at) VALUES('legacy_bank','Bank','bank',0,'2026-11-01T00:00:00Z')",
      )
      .run();
    const original = JSON.stringify(['Bangalore', 'BANGALORE', 'Home']);
    await legacy.db
      .prepare(
        "INSERT INTO transactions(id,date,type,amount,account_id,category_id,tags,created_at) VALUES('legacy_tx','2026-11-01','expense',100,'legacy_bank','cat_food',?,'2026-11-01T00:00:00Z')",
      )
      .bind(original)
      .run();
    await applyMigrations(legacy.db, ['0005_tag_search.sql']);
    expect(
      await legacy.db.prepare("SELECT tags FROM transactions WHERE id='legacy_tx'").first('tags'),
    ).toBe(original);
    expect(
      await legacy.db.prepare("SELECT uses FROM tags WHERE tag_key='bangalore'").first('uses'),
    ).toBe(1);
    expect((await owner.data<TagSuggestions>('/tags?search=bangaluru')).data).toHaveLength(1);
    await legacy.db.prepare("DELETE FROM transactions WHERE id='legacy_tx'").run();
    expect((await owner.data<TagSuggestions>('/tags?search=ban')).data).toEqual([]);
  } finally {
    await legacy.mf.dispose();
  }
});
