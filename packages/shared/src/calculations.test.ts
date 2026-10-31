import { describe, it, expect } from 'vitest';
import {
  toMinor,
  decimalMoney,
  accountBalance,
  calculateEmi,
  amortization,
  monthlyInterest,
  investmentSummary,
  xirr,
  budgetProgress,
  goalProgress,
  addMonths,
  parseCsv,
  escapeCsv,
} from './calculations';
describe('exact money', () => {
  it('parses decimals without binary floating point rounding', () => {
    expect(toMinor('0.29')).toBe(29);
    expect(toMinor('123456789.99')).toBe(12345678999);
    expect(toMinor('-10.1')).toBe(-1010);
    expect(decimalMoney(-1010)).toBe('-10.10');
    expect(toMinor('0')).toBe(0);
  });
  it('rejects excess precision, exponent notation and unsafe amounts', () => {
    for (const v of ['1.001', '1e3', 'NaN', 'Infinity', '10000000001', ''])
      expect(() => toMinor(v)).toThrow();
    expect(() => decimalMoney(0.1)).toThrow();
  });
});
describe('balances', () => {
  it('includes opening balances and both sides of a transfer exactly once', () => {
    const tx = [
      { account_id: 'a', to_account_id: null, type: 'income' as const, amount: 10000 },
      { account_id: 'a', to_account_id: null, type: 'expense' as const, amount: 1000 },
      { account_id: 'a', to_account_id: 'b', type: 'transfer' as const, amount: 3000 },
    ];
    expect(accountBalance({ id: 'a', opening_balance: 500 }, tx)).toBe(6500);
    expect(accountBalance({ id: 'b', opening_balance: 0 }, tx)).toBe(3000);
  });
});
describe('loan calculations', () => {
  it('calculates EMI and conserves every paise of principal', () => {
    const emi = calculateEmi(10000000, 1200, 12),
      rows = amortization(10000000, 1200, 12, emi, '2025-01-31');
    expect(emi).toBe(888488);
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)?.balance).toBe(0);
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(10000000);
    expect(
      rows.every((r) => Number.isInteger(r.amount) && r.amount === r.principal + r.interest),
    ).toBe(true);
    expect(rows[0].date).toBe('2025-02-28');
  });
  it('handles zero interest and rounding the final payment', () => {
    expect(calculateEmi(100, 0, 3)).toBe(34);
    expect(amortization(100, 0, 3, 34, '2025-01-01').map((r) => r.amount)).toEqual([34, 34, 32]);
    expect(monthlyInterest(10001, 600)).toBe(50);
  });
  it('prepayment reduces remaining tenure and future interest', () => {
    const base = amortization(50000000, 850, 60, 1025830, '2025-01-01'),
      updated = amortization(50000000, 850, 60, 1025830, '2025-01-01', [
        {
          date: '2025-01-15',
          amount: 10000000,
          principal: 10000000,
          interest: 0,
          kind: 'prepayment',
        },
      ]);
    expect(updated.filter((r) => !r.actual).length).toBeLessThan(base.length);
    expect(updated.reduce((s, r) => s + r.interest, 0)).toBeLessThan(
      base.reduce((s, r) => s + r.interest, 0),
    );
    expect(updated.at(-1)?.balance).toBe(0);
  });
  it('rejects non-amortizing EMI and overpayment', () => {
    expect(() => amortization(100000, 1200, 12, 500, '2025-01-01')).toThrow('EMI');
    expect(() =>
      amortization(100, 0, 1, 100, '2025-01-01', [
        { date: '2025-01-02', amount: 101, principal: 101, interest: 0, kind: 'prepayment' },
      ]),
    ).toThrow();
  });
  it('retains month-end dates across leap years', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-01-31', 2)).toBe('2024-03-31');
  });
});
describe('investments and XIRR', () => {
  it('computes net investment, profit and percentage after top-ups and sales', () => {
    expect(
      investmentSummary(
        [
          { kind: 'buy', amount: 10000 },
          { kind: 'buy', amount: 5000 },
          { kind: 'sell', amount: 2000 },
        ],
        15600,
      ),
    ).toEqual({ invested: 13000, current: 15600, profit: 2600, return_pct: 20 });
    expect(investmentSummary([], 100).return_pct).toBeNull();
    expect(investmentSummary([{ kind: 'sell', amount: 200 }], 0).return_pct).toBeNull();
  });
  it('solves known annual and irregular dated returns', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -10000 },
        { date: '2022-01-01', amount: 11000 },
      ]),
    ).toBeCloseTo(0.1, 7);
    const flows = [
        { date: '2021-01-01', amount: -10000 },
        { date: '2021-07-01', amount: -5000 },
        { date: '2022-01-01', amount: 17000 },
      ],
      r = xirr(flows)!;
    expect(r).toBeGreaterThan(0.1);
    expect(
      flows.reduce(
        (s, f) =>
          s +
          f.amount /
            Math.pow(1 + r, (Date.parse(f.date) - Date.parse(flows[0].date)) / 86400000 / 365),
        0,
      ),
    ).toBeCloseTo(0, 3);
  });
  it('falls back to bisection for a large negative return', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -100000 },
        { date: '2022-01-01', amount: 1 },
      ]),
    ).toBeCloseTo(-0.99999, 5);
  });
  it('returns null without a meaningful root', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -1 },
        { date: '2022-01-01', amount: -2 },
      ]),
    ).toBeNull();
    expect(
      xirr([
        { date: '2021-01-01', amount: -1 },
        { date: '2021-01-01', amount: 2 },
      ]),
    ).toBeNull();
    expect(xirr([])).toBeNull();
  });
});
describe('planning and portability', () => {
  it('reports overspending and zero-budget progress', () => {
    expect(budgetProgress(12500, 10000)).toEqual({
      spent: 12500,
      budget: 10000,
      remaining: -2500,
      percent: 125,
      over: true,
    });
    expect(budgetProgress(0, 0).percent).toBe(0);
  });
  it('computes savings target progress and monthly requirements', () => {
    const g = goalProgress(100000, 25000, '2026-04-01', '2026-01-01');
    expect(g.percent).toBe(25);
    expect(g.monthly_required).toBe(25000);
    expect(goalProgress(10000, 12000, '2025-01-01', '2026-01-01').monthly_required).toBe(0);
    expect(goalProgress(10000, 0, '2025-01-01', '2026-01-01').overdue).toBe(true);
  });
  it('parses multiline quoted CSV and prevents formula injection', () => {
    expect(parseCsv('date,note\r\n2025-01-01,"hello,\n""world"""')).toEqual([
      ['date', 'note'],
      ['2025-01-01', 'hello,\n"world"'],
    ]);
    expect(escapeCsv('=1+1')).toBe('"\'=1+1"');
    expect(() => parseCsv('a,"bad')).toThrow();
  });
});
