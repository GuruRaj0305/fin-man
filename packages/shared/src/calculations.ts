import type { Account, Transaction, Entry, Payment } from './schemas';
import { MAX_MONEY } from './schemas';

/** Parse decimal currency text exactly; never multiply floating-point currency. */
export function toMinor(value: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a number with at most two decimal places');
  const result =
    (BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))) * (match[1] ? -1n : 1n);
  if (result > BigInt(MAX_MONEY) || result < -BigInt(MAX_MONEY))
    throw new Error('Amount is too large');
  return Number(result);
}
export function decimalMoney(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('Money must be integer minor units');
  const n = BigInt(value),
    abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export function formatMoney(value: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
export function accountBalance(
  account: Pick<Account, 'id' | 'opening_balance'>,
  transactions: Pick<Transaction, 'account_id' | 'to_account_id' | 'type' | 'amount'>[],
): number {
  let n = BigInt(account.opening_balance);
  for (const t of transactions) {
    if (t.account_id === account.id) n += BigInt(t.amount) * (t.type === 'income' ? 1n : -1n);
    if (t.type === 'transfer' && t.to_account_id === account.id) n += BigInt(t.amount);
  }
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error('Balance exceeds safe range');
  return Number(n);
}
function roundDiv(n: bigint, d: bigint): bigint {
  return (n + d / 2n) / d;
}
export function monthlyInterest(principal: number, rateBps: number): number {
  return Number(roundDiv(BigInt(principal) * BigInt(rateBps), 120000n));
}
export function calculateEmi(principal: number, rateBps: number, months: number): number {
  if (!Number.isInteger(months) || months < 1 || months > 600) throw new Error('Invalid tenure');
  if (!rateBps) return Number((BigInt(principal) + BigInt(months) - 1n) / BigInt(months));
  const r = BigInt(rateBps),
    d = 120000n,
    p = (d + r) ** BigInt(months),
    q = d ** BigInt(months);
  return Number((BigInt(principal) * r * p + d * (p - q) - 1n) / (d * (p - q)));
}
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export type ScheduleRow = {
  date: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  actual: boolean;
  kind: 'emi' | 'prepayment';
};
export function amortization(
  principal: number,
  rateBps: number,
  months: number,
  emi: number,
  start: string,
  payments: Pick<Payment, 'date' | 'principal' | 'interest' | 'amount' | 'kind'>[] = [],
): ScheduleRow[] {
  if (!Number.isInteger(months) || months < 1 || months > 600)
    throw new Error('Invalid loan tenure');
  let balance = principal;
  const rows: ScheduleRow[] = [];
  for (const p of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    if (p.principal > balance) throw new Error('Payment exceeds outstanding principal');
    balance -= p.principal;
    rows.push({ ...p, balance, actual: true });
  }
  if (balance && emi <= monthlyInterest(balance, rateBps))
    throw new Error('EMI must exceed monthly interest');
  let cursor = 1;
  const last = rows.at(-1)?.date ?? start;
  while (addMonths(start, cursor) <= last) cursor++;
  for (let n = 0; balance > 0 && n < 1200; n++, cursor++) {
    const interest = monthlyInterest(balance, rateBps),
      amount = Math.min(emi, balance + interest),
      paid = amount - interest;
    balance -= paid;
    rows.push({
      date: addMonths(start, cursor),
      amount,
      principal: paid,
      interest,
      balance,
      actual: false,
      kind: 'emi',
    });
  }
  if (balance) throw new Error('This EMI cannot repay the loan within 100 years');
  return rows;
}
export function investmentSummary(entries: Pick<Entry, 'kind' | 'amount'>[], current: number) {
  const invested = entries.reduce((n, e) => n + (e.kind === 'buy' ? e.amount : -e.amount), 0);
  const profit = current - invested;
  return { invested, current, profit, return_pct: invested > 0 ? (profit / invested) * 100 : null };
}
export type CashFlow = { date: string; amount: number };
/** Annual XIRR. Money stays integer; only the dimensionless numerical solver uses floats.
 * Returns null for no sign change/no bracket. Multiple IRRs can exist for nonconventional flows.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0))
    return null;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(sorted[0].date),
    times = sorted.map((f) => (Date.parse(f.date) - t0) / 86400000 / 365);
  if (times.at(-1) === 0) return null;
  const scale = Math.max(...sorted.map((f) => Math.abs(f.amount)));
  const values = sorted.map((f) => f.amount / scale);
  const fn = (r: number) => values.reduce((sum, v, i) => sum + v / Math.pow(1 + r, times[i]), 0);
  let r = 0.1;
  for (let n = 0; n < 80; n++) {
    const f = fn(r),
      derivative = values.reduce(
        (sum, v, i) => sum - (times[i] * v) / Math.pow(1 + r, times[i] + 1),
        0,
      );
    if (Math.abs(f) < 1e-10) return r;
    const next = r - f / derivative;
    if (
      !Number.isFinite(next) ||
      next <= -0.999999 ||
      next > 1e8 ||
      !Number.isFinite(derivative) ||
      Math.abs(derivative) < 1e-14
    )
      break;
    r = next;
  }
  const probes = [
    -0.999999, -0.99, -0.9, -0.5, 0, 0.1, 0.5, 1, 2, 5, 10, 100, 1000, 10000, 1e6, 1e8,
  ];
  for (let i = 1; i < probes.length; i++) {
    let lo = probes[i - 1],
      hi = probes[i],
      flo = fn(lo),
      fhi = fn(hi);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) continue;
    for (let n = 0; n < 250; n++) {
      const mid = (lo + hi) / 2,
        f = fn(mid);
      if (Math.abs(f) < 1e-10 || hi - lo < 1e-10) return mid;
      if (f * flo <= 0) {
        hi = mid;
        fhi = f;
      } else {
        lo = mid;
        flo = f;
      }
    }
    return (lo + hi) / 2;
  }
  return null;
}
export function budgetProgress(spent: number, budget: number) {
  return {
    spent,
    budget,
    remaining: budget - spent,
    percent: budget > 0 ? (spent / budget) * 100 : 0,
    over: spent > budget,
  };
}
export function goalProgress(target: number, saved: number, targetDate: string, today: string) {
  const remaining = Math.max(0, target - saved);
  const months = Math.max(
    1,
    Math.ceil((Date.parse(targetDate) - Date.parse(today)) / 86400000 / 30.4375),
  );
  return {
    saved,
    remaining,
    percent: target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : 0,
    monthly_required: Math.ceil(remaining / months),
    overdue: targetDate < today && remaining > 0,
  };
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function escapeCsv(v: string | number): string {
  let s = String(v);
  // Prevent formula execution when opened in spreadsheet software.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length) {
        throw new Error('Invalid CSV quote');
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
