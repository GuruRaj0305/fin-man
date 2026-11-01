import { describe, expect, it } from 'vitest';
import { accountBalance, transactionBalanceHistory } from './calculations';
import type { Transaction } from './schemas';

const accounts = [
  { id: 'bank', opening_balance: 50000 },
  { id: 'wallet', opening_balance: 10000 },
];
function transaction(id: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: '2026-11-01',
    created_at: '2026-11-01T12:00:00.000Z',
    type: 'expense',
    amount: 30000,
    account_id: 'bank',
    to_account_id: null,
    category_id: 'cat_food',
    note: '',
    tags: [],
    ...extra,
  };
}

describe('transaction account balance history', () => {
  it('shows 500 before and 200 after spending 300', () => {
    expect(transactionBalanceHistory(accounts, [transaction('expense')])[0]).toMatchObject({
      balance_before: 50000,
      balance_after: 20000,
      to_balance_before: null,
      to_balance_after: null,
    });
  });

  it('tracks both transfer accounts and later income independently without mutating history', () => {
    const entries = [
      transaction('transfer', {
        type: 'transfer',
        to_account_id: 'wallet',
        category_id: null,
      }),
      transaction('income', {
        date: '2026-11-02',
        type: 'income',
        amount: 15000,
        category_id: 'cat_salary',
      }),
      transaction('wallet-expense', {
        date: '2026-11-03',
        account_id: 'wallet',
        amount: 5000,
      }),
    ];
    const original = structuredClone(entries);
    const rows = transactionBalanceHistory(accounts, entries);
    expect(rows[0]).toMatchObject({
      balance_before: 50000,
      balance_after: 20000,
      to_balance_before: 10000,
      to_balance_after: 40000,
    });
    expect(rows[1]).toMatchObject({ balance_before: 20000, balance_after: 35000 });
    expect(rows[2]).toMatchObject({ balance_before: 40000, balance_after: 35000 });
    expect(rows[1].balance_after).toBe(accountBalance(accounts[0], entries));
    expect(rows[2].balance_after).toBe(accountBalance(accounts[1], entries));
    expect(entries).toEqual(original);
  });

  it('orders by date, actual creation time and a stable ID tie-break', () => {
    const entries = [
      transaction('b', { created_at: '2026-11-01T12:00:00.9Z', amount: 1000 }),
      transaction('c', { created_at: '2026-11-01T12:00:00.90Z', amount: 2000 }),
      transaction('a', { created_at: '2026-11-01T12:00:00.123Z', amount: 3000 }),
      transaction('earlier', { date: '2026-10-01', amount: 4000 }),
    ];
    const rows = transactionBalanceHistory(accounts, entries);
    expect(rows.map((row) => row.id)).toEqual(['earlier', 'a', 'b', 'c']);
    expect(rows.map((row) => row.balance_after)).toEqual([46000, 43000, 42000, 40000]);
    expect(transactionBalanceHistory(accounts, [...entries].reverse())).toEqual(rows);
  });

  it('preserves negative balances and exact minor units, and rejects unsafe balances', () => {
    expect(
      transactionBalanceHistory(accounts, [transaction('overspent', { amount: 60001 })])[0],
    ).toMatchObject({ balance_before: 50000, balance_after: -10001 });
    const large = [{ id: 'bank', opening_balance: Number.MAX_SAFE_INTEGER - 1000 }];
    expect(
      transactionBalanceHistory(large, [transaction('small-expense', { amount: 999 })])[0],
    ).toMatchObject({ balance_after: Number.MAX_SAFE_INTEGER - 1999 });
    expect(() =>
      transactionBalanceHistory(large, [transaction('overflow', { type: 'income', amount: 1001 })]),
    ).toThrow('Balance exceeds safe range');
  });
});
