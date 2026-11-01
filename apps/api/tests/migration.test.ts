import { it, expect } from 'vitest';
import type { AuthStatus, Dataset } from '@folio/shared';
import { applyMigrations, testDatabase } from './database';
import { client, ownerCredentials, memberCredentials, testSecret } from './client';
import { hashPassword, digest, sign } from '../src/auth';

it('preserves the legacy owner, financial records and sessions while enabling email-based accounts', async () => {
  const { mf, db } = await testDatabase();
  try {
    await applyMigrations(db, ['0001_initial.sql', '0002_loan_payment_guard.sql']);
    const passwordHash = await hashPassword(ownerCredentials.password),
      token = 'a'.repeat(64),
      t = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare("INSERT INTO users VALUES(1,?,'2026-10-01T00:00:00Z')").bind(passwordHash),
      db
        .prepare('INSERT INTO sessions VALUES(?,1,?,?)')
        .bind(await digest(token), t + 3600, t + 7200),
      db.prepare(
        "INSERT INTO accounts(id,name,type,opening_balance,created_at) VALUES('old_bank','Preserved bank','bank',12345,'2026-10-01T00:00:00Z')",
      ),
      db.prepare(
        "INSERT INTO transactions(id,date,type,amount,account_id,category_id,created_at) VALUES('old_tx','2026-10-01','expense',100,'old_bank','cat_food','2026-10-01T00:00:00Z')",
      ),
    ]);
    await applyMigrations(db, ['0003_multi_user.sql', '0004_workspace_currency.sql']);
    const owner = client(db, `folio_session=${token}.${await sign(token, testSecret)}`);
    expect(await owner.data<AuthStatus>('/auth/status')).toMatchObject({
      authenticated: true,
      legacy_owner: true,
      registration_open: false,
      user: { id: 1, role: 'admin', email: null },
    });
    const data = await owner.data<Dataset>('/snapshot');
    expect(data.currency).toBe('INR');
    expect(data.accounts[0]).toMatchObject({
      id: 'old_bank',
      name: 'Preserved bank',
      opening_balance: 12345,
    });
    expect(data.transactions[0]).toMatchObject({
      id: 'old_tx',
      account_id: 'old_bank',
      amount: 100,
    });
    expect(JSON.stringify(data)).not.toContain('user_id');
    expect((await client(db).request('/auth/register', 'POST', memberCredentials)).status).toBe(
      409,
    );
    const legacy = client(db);
    expect(
      (await legacy.request('/auth/login', 'POST', { password: ownerCredentials.password })).status,
    ).toBe(200);
    await legacy.data('/auth/profile', 'POST', {
      name: ownerCredentials.name,
      email: ownerCredentials.email,
    });
    expect(
      (
        await legacy.request('/auth/profile', 'POST', {
          name: 'Again',
          email: 'another@example.test',
        })
      ).status,
    ).toBe(409);
    expect(
      (await client(db).request('/auth/login', 'POST', { password: ownerCredentials.password }))
        .status,
    ).toBe(401);
    expect(
      (
        await client(db).request('/auth/login', 'POST', {
          email: ownerCredentials.email,
          password: ownerCredentials.password,
        })
      ).status,
    ).toBe(200);
    const member = client(db);
    await member.data('/auth/register', 'POST', memberCredentials);
    expect((await member.data<Dataset>('/snapshot')).accounts).toEqual([]);
    expect((await owner.data<Dataset>('/snapshot')).accounts).toHaveLength(1);
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect(
      await db.prepare('SELECT password_hash FROM users WHERE id=1').first('password_hash'),
    ).toBe(passwordHash);
  } finally {
    await mf.dispose();
  }
});
