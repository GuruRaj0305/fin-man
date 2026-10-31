import {
  datasetSchema,
  type Dataset,
  type Account,
  type Transaction,
  monthlyInterest,
  amortization,
  investmentSummary,
  xirr,
  goalProgress,
  budgetProgress,
  accountBalance,
} from '@folio/shared';

export const tables = [
  'accounts',
  'categories',
  'transactions',
  'holdings',
  'investment_entries',
  'valuations',
  'goals',
  'contributions',
  'budgets',
  'loan_payments',
] as const;
export type Table = (typeof tables)[number];
export type Row = Record<string, unknown>;
const referenceKeys = new Set([
  'id',
  'account_id',
  'to_account_id',
  'category_id',
  'loan_id',
  'transaction_id',
  'holding_id',
  'goal_id',
]);
// The owner's existing IDs stay unchanged. Other workspaces use a storage-only
// namespace, so portable backups and default category IDs can safely overlap.
export function storageId(userId: number, id: string): string {
  return userId === 1 ? id : `${userId}:${id}`;
}
function encode(userId: number, row: Row): Row {
  return Object.fromEntries([
    ...Object.entries(row).map(([key, value]) => [
      key,
      referenceKeys.has(key) && typeof value === 'string' ? storageId(userId, value) : value,
    ]),
    ['user_id', userId],
  ]);
}
export function decode(table: Table, row: Row, userId: number): Row {
  delete row.user_id;
  if (userId !== 1)
    for (const key of referenceKeys)
      if (typeof row[key] === 'string') row[key] = row[key].slice(`${userId}:`.length);
  if (table === 'accounts' || table === 'categories') row.archived = !!row.archived;
  if (table === 'transactions') row.tags = JSON.parse(String(row.tags));
  return row;
}
export async function loadData(db: D1Database, userId: number): Promise<Dataset> {
  const results = await db.batch<Row>(
    tables.map((t) => db.prepare(`SELECT * FROM ${t} WHERE user_id=?`).bind(userId)),
  );
  return datasetSchema.parse(
    Object.fromEntries(
      tables.map((t, i) => [t, results[i].results.map((r) => decode(t, r, userId))]),
    ),
  );
}
export function insert(
  db: D1Database,
  userId: number,
  table: Table,
  row: Row,
  upsert = false,
): D1PreparedStatement {
  row = encode(userId, row);
  const keys = Object.keys(row),
    values = keys.map((k) =>
      typeof row[k] === 'boolean'
        ? Number(row[k])
        : Array.isArray(row[k])
          ? JSON.stringify(row[k])
          : row[k],
    );
  return db
    .prepare(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})${
        upsert
          ? ` ON CONFLICT(id) DO UPDATE SET ${keys
              .filter((k) => k !== 'id')
              .map((k) => `${k}=excluded.${k}`)
              .join(',')} WHERE ${table}.user_id=excluded.user_id`
          : ''
      }`,
    )
    .bind(...values);
}
/** JSON bulk inserts keep imports within Workers' D1 query limits. Bound JSON chunks
 * stay below D1's 2 MB value limit; all statements still commit in one atomic batch. */
export function bulkInsert(
  db: D1Database,
  userId: number,
  table: Table,
  rows: Row[],
  upsert = false,
): D1PreparedStatement[] {
  if (!rows.length) return [];
  rows = rows.map((row) => encode(userId, row));
  const keys = Object.keys(rows[0]),
    chunks: Row[][] = [];
  let chunk: Row[] = [],
    bytes = 2;
  const encoder = new TextEncoder();
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).byteLength + 1;
    if (bytes + size > 1500000 && chunk.length) {
      chunks.push(chunk);
      chunk = [];
      bytes = 2;
    }
    chunk.push(row);
    bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) SELECT ${keys.map((k) => `json_extract(value,'$.${k}')`).join(',')} FROM json_each(?) WHERE 1${
    upsert
      ? ` ON CONFLICT(id) DO UPDATE SET ${keys
          .filter((k) => k !== 'id')
          .map((k) => `${k}=excluded.${k}`)
          .join(',')} WHERE ${table}.user_id=excluded.user_id`
      : ''
  }`;
  return chunks.map((rows) => db.prepare(sql).bind(JSON.stringify(rows)));
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}
export class DomainError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}
export function findAccount(data: Dataset, id: string): Account {
  const a = data.accounts.find((a) => a.id === id);
  assert(a, 'Account not found');
  return a;
}
export function validateAccount(a: Account, data: Dataset, updating = false) {
  try {
    const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: a.currency });
    assert(
      formatter.resolvedOptions().maximumFractionDigits === 2,
      'Use a currency with two decimal minor units',
    );
  } catch {
    throw new DomainError(
      'Use a valid currency with two decimal minor units, such as INR, USD or EUR',
    );
  }
  if (a.type === 'loan') {
    assert(
      a.principal !== null &&
        a.principal > 0 &&
        a.rate_bps !== null &&
        a.tenure_months !== null &&
        a.emi !== null &&
        a.start_date !== null,
      'Complete all loan terms',
    );
    assert(a.opening_balance === 0, 'Loan opening balance must be zero; use principal');
    assert(a.emi > monthlyInterest(a.principal, a.rate_bps), 'EMI must exceed monthly interest');
    amortization(a.principal, a.rate_bps, a.tenure_months, a.emi, a.start_date);
  } else
    assert(
      [a.principal, a.rate_bps, a.tenure_months, a.emi, a.start_date, a.lender].every(
        (v) => v === null,
      ),
      'Loan terms only belong to loan accounts',
    );
  if (updating) {
    const old = data.accounts.find((v) => v.id === a.id);
    const referenced =
      data.transactions.some((t) => t.account_id === a.id || t.to_account_id === a.id) ||
      data.goals.some((g) => g.account_id === a.id);
    if (referenced)
      assert(
        old?.currency === a.currency && old?.type === a.type,
        'Type and currency cannot change after this account is used',
      );
    if (data.loan_payments.some((p) => p.loan_id === a.id))
      assert(
        old &&
          (['principal', 'rate_bps', 'tenure_months', 'emi', 'start_date'] as const).every(
            (k) => old[k] === a[k],
          ),
        'Loan terms cannot change after a payment; remove payments first',
      );
  }
}
export function validateTransaction(t: Transaction, data: Dataset, importing = false) {
  const a = findAccount(data, t.account_id);
  assert(a.type !== 'loan', 'Record loan repayments from the loan detail page');
  if (!importing) assert(!a.archived, 'Choose an active account');
  if (t.type === 'transfer') {
    assert(
      t.to_account_id && t.to_account_id !== t.account_id && !t.category_id,
      'Transfers need two different accounts and no category',
    );
    const b = findAccount(data, t.to_account_id);
    assert(
      b.type !== 'loan' && b.currency === a.currency,
      'Transfer accounts must have the same currency and cannot be loans',
    );
    if (!importing) assert(!b.archived, 'Destination account is archived');
  } else {
    assert(!t.to_account_id, 'Only transfers have a destination account');
    const cat = data.categories.find((c) => c.id === t.category_id);
    assert(cat && cat.type === t.type, 'Choose a matching category');
    if (!importing) assert(!cat.archived, 'Choose an active category');
  }
}
export function validateDataset(d: Dataset) {
  for (const table of tables)
    assert(
      new Set(d[table].map((r) => r.id)).size === d[table].length,
      `Duplicate IDs in ${table}`,
    );
  const catKeys = d.categories.map((c) => `${c.type}:${c.name.toLowerCase()}`);
  assert(new Set(catKeys).size === catKeys.length, 'Duplicate category names');
  d.accounts.forEach((a) => validateAccount(a, d));
  d.transactions.forEach((t) => validateTransaction(t, d, true));
  const usedTransactions = new Set<string>();
  for (const loan of d.accounts.filter((a) => a.type === 'loan')) {
    let remaining = loan.principal!;
    for (const p of d.loan_payments
      .filter((p) => p.loan_id === loan.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))) {
      const t = d.transactions.find((t) => t.id === p.transaction_id);
      assert(
        t && t.type === 'expense' && t.amount === p.amount && t.date === p.date,
        'Loan payment must match its expense transaction',
      );
      assert(
        findAccount(d, t.account_id).currency === loan.currency,
        'Loan payment currency mismatch',
      );
      assert(
        !usedTransactions.has(p.transaction_id),
        'A transaction cannot be linked to multiple payments',
      );
      usedTransactions.add(p.transaction_id);
      assert(
        p.date >= loan.start_date! &&
          p.principal <= remaining &&
          p.principal + p.interest === p.amount,
        'Invalid loan payment allocation',
      );
      assert(
        p.interest === (p.kind === 'prepayment' ? 0 : monthlyInterest(remaining, loan.rate_bps!)),
        'Invalid loan interest allocation',
      );
      assert(p.principal > 0, 'Payment must reduce principal');
      remaining -= p.principal;
    }
  }
  for (const p of d.loan_payments)
    assert(
      d.accounts.some((a) => a.id === p.loan_id && a.type === 'loan'),
      'Missing loan',
    );
  for (const e of [...d.investment_entries, ...d.valuations])
    assert(
      d.holdings.some((h) => h.id === e.holding_id),
      'Missing holding',
    );
  for (const g of d.goals)
    if (g.account_id) {
      const a = findAccount(d, g.account_id);
      assert(a.type === 'savings' && a.currency === 'INR', 'Goals link to INR savings accounts');
    }
  for (const c of d.contributions) {
    const g = d.goals.find((g) => g.id === c.goal_id);
    assert(g && !g.account_id, 'Contributions require a manual goal');
  }
  const budgetKeys = d.budgets.map((b) => `${b.category_id}:${b.month}`);
  assert(new Set(budgetKeys).size === budgetKeys.length, 'Duplicate category budgets for a month');
  for (const b of d.budgets)
    assert(
      d.categories.some((c) => c.id === b.category_id && c.type === 'expense'),
      'Budget requires an expense category',
    );
  // Bounding the sum of absolute monetary fields keeps every report's additions
  // exact in JavaScript, even when many individually valid records are imported.
  let magnitude = 0n;
  const moneyKeys = new Set([
    'opening_balance',
    'principal',
    'emi',
    'amount',
    'interest',
    'value',
    'target_amount',
  ]);
  for (const table of tables)
    for (const row of d[table])
      for (const [key, value] of Object.entries(row))
        if (moneyKeys.has(key) && typeof value === 'number') magnitude += BigInt(Math.abs(value));
  assert(
    magnitude <= BigInt(Number.MAX_SAFE_INTEGER),
    'Combined monetary values exceed the safe integer range',
  );
  d.accounts.forEach((a) => accountBalance(a, d.transactions));
}
export function loanDetails(data: Dataset, id: string) {
  const loan = findAccount(data, id);
  assert(loan.type === 'loan', 'Not a loan');
  const payments = data.loan_payments
    .filter((p) => p.loan_id === id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const schedule = amortization(
    loan.principal!,
    loan.rate_bps!,
    loan.tenure_months!,
    loan.emi!,
    loan.start_date!,
    payments,
  );
  const outstanding = loan.principal! - payments.reduce((s, p) => s + p.principal, 0);
  return {
    loan,
    payments,
    schedule,
    outstanding,
    interest_paid: payments.reduce((s, p) => s + p.interest, 0),
    remaining_months: schedule.filter((s) => !s.actual).length,
    progress: ((loan.principal! - outstanding) / loan.principal!) * 100,
  };
}
export function holdingDetails(data: Dataset, id: string, asOf = '9999-12-31') {
  const holding = data.holdings.find((h) => h.id === id);
  assert(holding, 'Holding not found');
  const entries = data.investment_entries
    .filter((e) => e.holding_id === id && e.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  const valuations = data.valuations
    .filter((v) => v.holding_id === id && v.date <= asOf)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  const latest = valuations.at(-1),
    summary = investmentSummary(entries, latest?.value ?? 0);
  const valuationDate = latest?.date;
  const datedFlows = entries
    .filter((e) => valuationDate && e.date <= valuationDate)
    .map((e) => ({ date: e.date, amount: e.kind === 'buy' ? -e.amount : e.amount }));
  return {
    holding,
    entries,
    valuations,
    ...summary,
    valued: !!latest,
    last_updated: valuationDate ?? null,
    xirr: latest ? xirr([...datedFlows, { date: latest.date, amount: latest.value }]) : null,
    stale: !!latest && entries.some((e) => e.date > latest.date),
  };
}
export function overview(data: Dataset, month: string, today: string) {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
    .toISOString()
    .slice(0, 10);
  const asOf = end < today ? end : today;
  // An opening balance starts on account creation, or the first recorded date
  // when a user adds backdated history to a newly created account.
  const starts = new Map(data.accounts.map((a) => [a.id, a.created_at.slice(0, 10)]));
  for (const t of data.transactions)
    for (const id of [t.account_id, t.to_account_id])
      if (id && t.date < (starts.get(id) ?? t.date)) starts.set(id, t.date);
  const tx = data.transactions.filter((t) => t.date <= asOf),
    baseIds = new Set(data.accounts.filter((a) => a.currency === 'INR').map((a) => a.id));
  const baseTx = tx.filter((t) => baseIds.has(t.account_id));
  const accounts = data.accounts.map((a) => ({ ...a, balance: accountBalance(a, tx) }));
  const loans = data.accounts
    .filter((a) => a.type === 'loan')
    .map((a) =>
      loanDetails(
        { ...data, loan_payments: data.loan_payments.filter((p) => p.date <= asOf) },
        a.id,
      ),
    );
  const holdings = data.holdings.map((h) => holdingDetails(data, h.id, asOf));
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0),
    investmentValue = holdings.reduce((s, h) => s + h.current, 0);
  const loanOutstanding = loans
    .filter((l) => l.loan.currency === 'INR' && l.loan.start_date! <= asOf)
    .reduce((s, l) => s + l.outstanding, 0);
  // Investment accounts can hold cash; portfolio holdings represent separate manually tracked assets.
  const assets =
    accounts
      .filter((a) => a.type !== 'loan' && a.currency === 'INR' && starts.get(a.id)! <= asOf)
      .reduce((s, a) => s + a.balance, 0) + investmentValue;
  const monthlyTx = baseTx.filter((t) => t.date.startsWith(month));
  const income = monthlyTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    expense = monthlyTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const categories = data.categories.map((c) => ({
    ...c,
    total: monthlyTx
      .filter((t) => t.category_id === c.id && t.type === c.type)
      .reduce((s, t) => s + t.amount, 0),
  }));
  const history = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 - (11 - i), 1),
      ),
      key = date.toISOString().slice(0, 7);
    const until = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const cutoff = until < today ? until : today,
      period = baseTx.filter((t) => t.date.startsWith(key) && t.date <= cutoff);
    const currentHoldings = data.holdings.map((h) => holdingDetails(data, h.id, cutoff));
    const invested = currentHoldings.reduce((s, h) => s + h.invested, 0),
      value = currentHoldings.reduce((s, h) => s + h.current, 0);
    const relevant = data.accounts.filter(
      (a) => a.currency === 'INR' && a.type !== 'loan' && starts.get(a.id)! <= cutoff,
    );
    const debt = data.accounts
      .filter((a) => a.currency === 'INR' && a.type === 'loan' && a.start_date! <= cutoff)
      .reduce(
        (s, a) =>
          s +
          a.principal! -
          data.loan_payments
            .filter((p) => p.loan_id === a.id && p.date <= cutoff)
            .reduce((p, e) => p + e.principal, 0),
        0,
      );
    return {
      month: key,
      income: period.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: period.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      net_worth:
        relevant.reduce(
          (s, a) =>
            s +
            accountBalance(
              a,
              tx.filter((t) => t.date <= cutoff),
            ),
          0,
        ) +
        value -
        debt,
      invested,
      value,
    };
  });
  const goals = data.goals.map((g) => {
    const saved = g.account_id
      ? (accounts.find((a) => a.id === g.account_id)?.balance ?? 0)
      : data.contributions
          .filter((c) => c.goal_id === g.id && c.date <= asOf)
          .reduce((s, c) => s + c.amount, 0);
    return { ...g, ...goalProgress(g.target_amount, saved, g.target_date, asOf) };
  });
  const budgets = data.budgets
    .filter((b) => b.month === month)
    .map((b) => ({
      ...b,
      ...budgetProgress(categories.find((c) => c.id === b.category_id)?.total ?? 0, b.amount),
    }));
  return {
    month,
    as_of: asOf,
    currency: 'INR',
    net_worth: assets - loanOutstanding,
    income,
    expense,
    savings_rate: income > 0 ? ((income - expense) / income) * 100 : 0,
    loan_outstanding: loanOutstanding,
    investment_profit: investmentValue - totalInvested,
    investment_return:
      totalInvested > 0 ? ((investmentValue - totalInvested) / totalInvested) * 100 : null,
    total_invested: totalInvested,
    investment_value: investmentValue,
    accounts,
    loans,
    holdings,
    categories,
    history,
    goals,
    budgets,
    recent: [...monthlyTx]
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
      .slice(0, 6),
  };
}
