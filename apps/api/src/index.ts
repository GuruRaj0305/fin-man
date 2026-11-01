import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z, ZodError, type ZodTypeAny } from 'zod';
import {
  accountInput,
  categoryInput,
  transactionInput,
  holdingInput,
  entryInput,
  valuationInput,
  goalInput,
  contributionInput,
  budgetInput,
  paymentInput,
  currencyInput,
  importSchema,
  transactionQuery,
  tagSearchQuery,
  listQuery,
  monthSchema,
  idSchema,
  dateSchema,
  monthlyInterest,
  accountBalance,
  transactionBalanceHistory,
  decimalMoney,
  escapeCsv,
  type Dataset,
  type Account,
  type AccountDetail,
  type Transaction,
  type Payment,
} from '@folio/shared';
import type { Env } from './types';
import { readSession } from './auth';
import authRoutes from './auth-routes';
import { canonicalizeTags, searchTags } from './tags';
import {
  loadData,
  accountDeletionReason,
  storageId,
  insert,
  bulkInsert,
  tables,
  assert,
  DomainError,
  validateAccount,
  validateTransaction,
  validateDataset,
  loanDetails,
  holdingDetails,
  overview,
  type Table,
  type Row,
} from './data';

const app = new Hono<Env>();
type Ctx = Context<Env>;
const prefix = '/api/v1';
const open = new Set([
  `${prefix}/auth/status`,
  `${prefix}/auth/setup`,
  `${prefix}/auth/login`,
  `${prefix}/auth/register`,
]);
const fail = (
  c: Ctx,
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500,
  details?: unknown,
) => c.json({ error: { code, message, ...(details ? { details } : {}) } }, status);
const now = () => new Date().toISOString();
const record = (body: Row): Row & { id: string; created_at: string } => ({
  ...body,
  id: crypto.randomUUID(),
  created_at: now(),
});
const parseId = (c: Ctx) => idSchema.parse(c.req.param('id'));

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  c.header('Cache-Control', 'no-store');
  if (c.env.ENVIRONMENT !== 'development')
    c.header('Strict-Transport-Security', 'max-age=31536000');
  if (!c.req.path.startsWith('/api/')) return fail(c, 'NOT_FOUND', 'API route not found', 404);
  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32)
    return fail(c, 'CONFIGURATION', 'Server secret is not configured', 500);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (c.req.header('X-Finance-Client') !== 'web')
      return fail(c, 'CSRF', 'Missing application request header', 403);
    const origin = c.req.header('Origin');
    if (origin && origin !== c.env.APP_ORIGIN)
      return fail(c, 'CSRF', 'Request origin is not allowed', 403);
    if (!c.req.header('Content-Type')?.startsWith('application/json'))
      return fail(c, 'CONTENT_TYPE', 'Use application/json', 400);
  }
  if (!open.has(c.req.path)) {
    const session = await readSession(c);
    if (!session) return fail(c, 'UNAUTHORIZED', 'Please sign in', 401);
    c.set('session', session.key);
    c.set('user', session.user);
  }
  await next();
});
app.use(
  '*',
  bodyLimit({
    maxSize: 20 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Import exceeds 20 MB' } }, 413),
  }),
);
app.onError((err, c) => {
  if (err instanceof ZodError)
    return fail(c, 'VALIDATION', 'Check the submitted values', 400, err.flatten());
  if (err instanceof SyntaxError) return fail(c, 'INVALID_JSON', 'Invalid JSON request', 400);
  if (err instanceof DomainError)
    return fail(c, err.status === 404 ? 'NOT_FOUND' : 'VALIDATION', err.message, err.status);
  // Never echo DB errors, request bodies, secrets, or financial records.
  if (/UNIQUE constraint failed: users\.email/i.test(err.message))
    return fail(c, 'EMAIL_IN_USE', 'An account with this email already exists.', 409);
  if (/constraint|UNIQUE|FOREIGN KEY|loan payment/i.test(err.message))
    return fail(
      c,
      'CONFLICT',
      'This change conflicts with existing records. Check references, duplicate names, or loan payments.',
      409,
    );
  return fail(c, 'INTERNAL', 'The request could not be completed', 500);
});
app.notFound((c) => fail(c, 'NOT_FOUND', 'API route not found', 404));

app.route(prefix, authRoutes);

function page<T>(rows: T[], query: { page: number; limit: number }) {
  return {
    data: rows.slice((query.page - 1) * query.limit, query.page * query.limit),
    total: rows.length,
    ...query,
  };
}
app.get(`${prefix}/snapshot`, async (c) => c.json(await loadData(c.env.DB, c.get('user').id)));
app.get(`${prefix}/tags`, async (c) => {
  const query = tagSearchQuery.parse({ ...c.req.query(), exclude: c.req.queries('exclude') ?? [] });
  return c.json({ data: await searchTags(c.env.DB, c.get('user').id, query) });
});
app.get(`${prefix}/accounts/:id`, async (c) => {
  const id = parseId(c),
    data = await loadData(c.env.DB, c.get('user').id),
    account = data.accounts.find((account) => account.id === id);
  if (!account) return fail(c, 'NOT_FOUND', 'Account not found', 404);
  const stats = { income: 0, expense: 0, transfer_in: 0, transfer_out: 0, transaction_count: 0 };
  for (const transaction of data.transactions) {
    if (transaction.account_id === id) {
      stats.transaction_count++;
      if (transaction.type === 'income') stats.income += transaction.amount;
      else if (transaction.type === 'expense') stats.expense += transaction.amount;
      else stats.transfer_out += transaction.amount;
    } else if (transaction.type === 'transfer' && transaction.to_account_id === id) {
      stats.transaction_count++;
      stats.transfer_in += transaction.amount;
    }
  }
  return c.json({
    account: {
      ...account,
      balance:
        account.type === 'loan'
          ? loanDetails(data, id).outstanding
          : accountBalance(account, data.transactions),
    },
    stats,
    goals: data.goals.filter((goal) => goal.account_id === id),
    delete_reason: accountDeletionReason(data, id),
  } satisfies AccountDetail);
});
app.put(`${prefix}/settings/currency`, async (c) => {
  const { currency } = currencyInput.parse(await c.req.json()),
    userId = c.get('user').id;
  // One atomic batch changes the workspace unit, including archived accounts and loans.
  // Monetary values and payment allocations are deliberately left untouched.
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET currency=? WHERE id=?').bind(currency, userId),
    c.env.DB.prepare('UPDATE accounts SET currency=? WHERE user_id=?').bind(currency, userId),
  ]);
  return c.json({ currency });
});
app.get(`${prefix}/overview`, async (c) => {
  const q = z.object({ month: monthSchema, today: dateSchema }).parse(c.req.query());
  return c.json(overview(await loadData(c.env.DB, c.get('user').id), q.month, q.today));
});
app.get(`${prefix}/reports`, async (c) => {
  const q = z
    .object({ year: z.coerce.number().int().min(1900).max(9999), month: monthSchema.optional() })
    .parse(c.req.query());
  const data = await loadData(c.env.DB, c.get('user').id),
    ids = new Set(data.accounts.filter((a) => a.currency === data.currency).map((a) => a.id));
  const tx = data.transactions.filter(
    (t) =>
      ids.has(t.account_id) &&
      t.type !== 'transfer' &&
      (q.month ? t.date.startsWith(q.month) : t.date.startsWith(String(q.year))),
  );
  return c.json({
    currency: data.currency,
    income: tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    expense: tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    categories: data.categories.map((c) => ({
      ...c,
      amount: tx.filter((t) => t.category_id === c.id).reduce((s, t) => s + t.amount, 0),
    })),
  });
});

const resources: [string, Table, ZodTypeAny][] = [
  ['accounts', 'accounts', accountInput],
  ['categories', 'categories', categoryInput],
  ['transactions', 'transactions', transactionInput],
  ['investments', 'holdings', holdingInput],
  ['goals', 'goals', goalInput],
  ['budgets', 'budgets', budgetInput],
];
for (const [path, table, schema] of resources) {
  app.get(`${prefix}/${path}`, async (c) => {
    const data = await loadData(c.env.DB, c.get('user').id),
      q =
        table === 'transactions'
          ? transactionQuery.parse(c.req.query())
          : listQuery.parse(c.req.query());
    let rows: Row[] = [...data[table]];
    if (table === 'accounts')
      rows = data.accounts.map((a) => ({ ...a, balance: accountBalance(a, data.transactions) }));
    if (table === 'transactions') {
      const f = transactionQuery.parse(c.req.query());
      rows = transactionBalanceHistory(data.accounts, data.transactions)
        .filter(
          (t) =>
            (!f.from || t.date >= f.from) &&
            (!f.to || t.date <= f.to) &&
            (!f.account_id || t.account_id === f.account_id || t.to_account_id === f.account_id) &&
            (!f.category_id || t.category_id === f.category_id) &&
            (!f.type || t.type === f.type) &&
            (!f.search ||
              [t.note, ...t.tags, data.categories.find((c) => c.id === t.category_id)?.name ?? '']
                .join(' ')
                .toLowerCase()
                .includes(f.search.toLowerCase())),
        )
        .reverse();
    }
    return c.json(page(rows, { page: q.page, limit: q.limit }));
  });
  app.post(`${prefix}/${path}`, async (c) => {
    const input = await c.req.json(),
      body = schema.parse(input) as Row;
    if (table === 'transactions')
      body.tags = await canonicalizeTags(c.env.DB, c.get('user').id, body.tags as string[]);
    const row = record(body),
      data = await loadData(c.env.DB, c.get('user').id);
    if (table === 'accounts') {
      assert(!input.currency || input.currency === data.currency, 'Change currency in Settings');
      row.currency = data.currency;
      validateAccount(row as Account, data);
    }
    if (table === 'transactions') validateTransaction(row as Transaction, data);
    if (table === 'goals' && body.account_id)
      assert(
        !data.accounts.find((a) => a.id === body.account_id)?.archived,
        'Choose an active account',
      );
    const candidate = { ...data, [table]: [...data[table], row] } as Dataset;
    validateDataset(candidate);
    await insert(c.env.DB, c.get('user').id, table, row).run();
    return c.json(row, 201);
  });
  app.put(`${prefix}/${path}/:id`, async (c) => {
    const id = parseId(c),
      input = await c.req.json(),
      body = schema.parse(input) as Row,
      data = await loadData(c.env.DB, c.get('user').id),
      old = data[table].find((r) => r.id === id);
    if (!old) return fail(c, 'NOT_FOUND', 'Record not found', 404);
    if (table === 'transactions')
      body.tags = await canonicalizeTags(c.env.DB, c.get('user').id, body.tags as string[]);
    if (table === 'transactions' && data.loan_payments.some((p) => p.transaction_id === id))
      throw new DomainError('Remove the latest loan payment and record it again to change it');
    if (table === 'accounts') {
      assert(!input.currency || input.currency === data.currency, 'Change currency in Settings');
      body.currency = data.currency;
    }
    const row = { ...body, id, created_at: old.created_at };
    if (table === 'accounts') validateAccount(row as Account, data, true);
    if (table === 'transactions') validateTransaction(row as Transaction, data);
    const candidate = {
      ...data,
      [table]: data[table].map((r) => (r.id === id ? row : r)),
    } as Dataset;
    validateDataset(candidate);
    await insert(c.env.DB, c.get('user').id, table, row, true).run();
    return c.json(row);
  });
  app.delete(`${prefix}/${path}/:id`, async (c) => {
    z.object({})
      .strict()
      .parse(await c.req.json());
    const id = parseId(c),
      data = await loadData(c.env.DB, c.get('user').id);
    if (!data[table].some((r) => r.id === id)) return fail(c, 'NOT_FOUND', 'Record not found', 404);
    if (table === 'accounts') {
      const reason = accountDeletionReason(data, id);
      if (reason) throw new DomainError(reason, 409);
    }
    if (
      table === 'categories' &&
      (data.transactions.some((t) => t.category_id === id) ||
        data.budgets.some((b) => b.category_id === id))
    ) {
      throw new DomainError(
        'This category is used by transactions or budgets. Archive it to hide it without losing history.',
        409,
      );
    }
    if (table === 'transactions') {
      const payment = data.loan_payments.find((p) => p.transaction_id === id);
      if (payment) {
        const payments = loanDetails(data, payment.loan_id).payments;
        assert(
          payments.at(-1)?.id === payment.id,
          'Remove newer loan payments first to preserve interest allocation',
        );
      }
    }
    // Cascades intentionally remove detail records with a holding or goal.
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`)
      .bind(storageId(c.get('user').id, id), c.get('user').id)
      .run();
    return c.json({ ok: true });
  });
}

app.get(`${prefix}/loans`, async (c) => {
  const q = listQuery.parse(c.req.query()),
    data = await loadData(c.env.DB, c.get('user').id);
  return c.json(
    page(
      data.accounts.filter((a) => a.type === 'loan').map((a) => loanDetails(data, a.id)),
      q,
    ),
  );
});
app.post(`${prefix}/loans`, async (c) => {
  const input = (await c.req.json()) as Row,
    row = record(accountInput.parse({ ...input, type: 'loan' })),
    data = await loadData(c.env.DB, c.get('user').id);
  assert(!input.currency || input.currency === data.currency, 'Change currency in Settings');
  row.currency = data.currency;
  validateAccount(row as Account, data);
  await insert(c.env.DB, c.get('user').id, 'accounts', row).run();
  return c.json(row, 201);
});
app.get(`${prefix}/loans/:id`, async (c) =>
  c.json(loanDetails(await loadData(c.env.DB, c.get('user').id), parseId(c))),
);
app.get(`${prefix}/loans/:id/schedule`, async (c) =>
  c.json(loanDetails(await loadData(c.env.DB, c.get('user').id), parseId(c)).schedule),
);
app.post(`${prefix}/loans/:id/payments`, async (c) => {
  const id = parseId(c),
    b = paymentInput.parse(await c.req.json()),
    data = await loadData(c.env.DB, c.get('user').id),
    detail = loanDetails(data, id);
  const source = data.accounts.find((a) => a.id === b.account_id);
  assert(
    source &&
      !source.archived &&
      source.type !== 'loan' &&
      source.currency === detail.loan.currency,
    'Choose an active payment account in the same currency',
  );
  assert(
    b.date >= detail.loan.start_date! &&
      b.date >= (detail.payments.at(-1)?.date ?? detail.loan.start_date!),
    'Record loan payments in date order',
  );
  assert(detail.outstanding > 0, 'This loan is paid off');
  const interest =
    b.kind === 'prepayment' ? 0 : monthlyInterest(detail.outstanding, detail.loan.rate_bps!);
  const principal = b.amount - interest;
  assert(
    principal > 0 && principal <= detail.outstanding,
    'Payment must cover interest and cannot exceed the outstanding amount',
  );
  const cat =
    data.categories.find(
      (c) => c.type === 'expense' && !c.archived && c.name.toLowerCase() === 'emi',
    ) ?? data.categories.find((c) => c.type === 'expense' && !c.archived);
  assert(cat, 'Create an expense category first');
  const tx = record(
    transactionInput.parse({
      date: b.date,
      type: 'expense',
      amount: b.amount,
      account_id: b.account_id,
      category_id: cat.id,
      note: `${b.kind === 'prepayment' ? 'Prepayment' : 'EMI'} · ${detail.loan.name}`,
    }),
  );
  const payment = record({
    loan_id: id,
    transaction_id: tx.id,
    date: b.date,
    kind: b.kind,
    amount: b.amount,
    principal,
    interest,
  }) as Payment;
  await c.env.DB.batch([
    insert(c.env.DB, c.get('user').id, 'transactions', tx),
    insert(c.env.DB, c.get('user').id, 'loan_payments', payment),
  ]);
  return c.json(payment, 201);
});
app.delete(`${prefix}/loans/:id/payments/:paymentId`, async (c) => {
  z.object({})
    .strict()
    .parse(await c.req.json());
  const data = await loadData(c.env.DB, c.get('user').id),
    details = loanDetails(data, parseId(c));
  const p = details.payments.find((p) => p.id === idSchema.parse(c.req.param('paymentId')));
  assert(p, 'Payment not found');
  assert(details.payments.at(-1)?.id === p.id, 'Remove newer payments first');
  await c.env.DB.prepare('DELETE FROM transactions WHERE id=? AND user_id=?')
    .bind(storageId(c.get('user').id, p.transaction_id), c.get('user').id)
    .run();
  return c.json({ ok: true });
});
app.get(`${prefix}/investments/:id`, async (c) =>
  c.json(holdingDetails(await loadData(c.env.DB, c.get('user').id), parseId(c))),
);
for (const [path, table, schema, parentTable, parentKey] of [
  ['investments', 'investment_entries', entryInput, 'holdings', 'holding_id'],
  ['investments', 'valuations', valuationInput, 'holdings', 'holding_id'],
  ['goals', 'contributions', contributionInput, 'goals', 'goal_id'],
] as const) {
  const suffix = table === 'investment_entries' ? 'entries' : table;
  app.get(`${prefix}/${path}/:id/${suffix}`, async (c) => {
    const id = parseId(c),
      q = listQuery.parse(c.req.query()),
      data = await loadData(c.env.DB, c.get('user').id);
    if (!data[parentTable].some((row) => row.id === id))
      return fail(c, 'NOT_FOUND', 'Parent record not found', 404);
    return c.json(
      page(
        data[table].filter((r) => r[parentKey as keyof typeof r] === id),
        q,
      ),
    );
  });
  app.post(`${prefix}/${path}/:id/${suffix}`, async (c) => {
    const id = parseId(c),
      body = schema.parse(await c.req.json()),
      data = await loadData(c.env.DB, c.get('user').id);
    assert(
      data[parentTable].some((r) => r.id === id),
      'Parent record not found',
    );
    const row = record({ ...body, [parentKey]: id });
    validateDataset({ ...data, [table]: [...data[table], row] } as Dataset);
    await insert(c.env.DB, c.get('user').id, table, row).run();
    return c.json(row, 201);
  });
  app.delete(`${prefix}/${path}/:id/${suffix}/:childId`, async (c) => {
    z.object({})
      .strict()
      .parse(await c.req.json());
    const id = parseId(c),
      child = idSchema.parse(c.req.param('childId'));
    const result = await c.env.DB.prepare(
      `DELETE FROM ${table} WHERE id=? AND ${parentKey}=? AND user_id=?`,
    )
      .bind(storageId(c.get('user').id, child), storageId(c.get('user').id, id), c.get('user').id)
      .run();
    if (!result.meta.changes) return fail(c, 'NOT_FOUND', 'Record not found', 404);
    return c.json({ ok: true });
  });
}

app.get(`${prefix}/export`, async (c) => {
  c.header('Content-Disposition', `attachment; filename="folio-backup-${now().slice(0, 10)}.json"`);
  return c.json({
    version: 1,
    exported_at: now(),
    data: await loadData(c.env.DB, c.get('user').id),
  });
});
app.get(`${prefix}/export/transactions.csv`, async (c) => {
  const data = await loadData(c.env.DB, c.get('user').id),
    f = transactionQuery.parse(c.req.query());
  const rows = data.transactions.filter(
    (t) =>
      (!f.from || t.date >= f.from) &&
      (!f.to || t.date <= f.to) &&
      (!f.type || t.type === f.type) &&
      (!f.account_id || t.account_id === f.account_id || t.to_account_id === f.account_id) &&
      (!f.category_id || t.category_id === f.category_id) &&
      (!f.search ||
        [t.note, ...t.tags, data.categories.find((c) => c.id === t.category_id)?.name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(f.search.toLowerCase())),
  );
  const header = [
    'date',
    'type',
    'amount',
    'currency',
    'account',
    'to_account',
    'category',
    'note',
    'tags',
  ];
  const csv = [
    header.map(escapeCsv).join(','),
    ...rows.map((t) =>
      [
        t.date,
        t.type,
        decimalMoney(t.amount),
        data.accounts.find((a) => a.id === t.account_id)?.currency ?? data.currency,
        data.accounts.find((a) => a.id === t.account_id)?.name ?? '',
        data.accounts.find((a) => a.id === t.to_account_id)?.name ?? '',
        data.categories.find((a) => a.id === t.category_id)?.name ?? '',
        t.note,
        t.tags.join('|'),
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ].join('\r\n');
  c.header('Content-Disposition', 'attachment; filename="folio-transactions.csv"');
  return c.body(`\uFEFF${csv}`, 200, { 'Content-Type': 'text/csv; charset=utf-8' });
});
app.post(`${prefix}/import`, async (c) => {
  const b = importSchema.parse(await c.req.json());
  const existing = await loadData(c.env.DB, c.get('user').id),
    currency = b.mode === 'replace' ? b.backup.data.currency : existing.currency;
  let data = b.backup.data;
  if (b.mode === 'merge') {
    data = {
      ...data,
      ...Object.fromEntries(
        tables.map((t) => [
          t,
          [...new Map([...existing[t], ...data[t]].map((r) => [r.id, r])).values()],
        ]),
      ),
    };
  }
  data = { ...data, currency, accounts: data.accounts.map((a) => ({ ...a, currency })) };
  validateDataset(data);
  // D1 batch is atomic: either all deletes/upserts commit or the existing data remains.
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE users SET currency=? WHERE id=?').bind(currency, c.get('user').id),
  ];
  if (b.mode === 'replace')
    for (const t of [...tables].reverse())
      statements.push(c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(c.get('user').id));
  for (const t of tables)
    statements.push(
      ...bulkInsert(
        c.env.DB,
        c.get('user').id,
        t,
        [...data[t]].sort((a, b) =>
          t === 'loan_payments'
            ? String((a as Payment).date).localeCompare(String((b as Payment).date)) ||
              a.created_at.localeCompare(b.created_at)
            : 0,
        ),
        b.mode === 'merge',
      ),
    );
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ ok: true, records: tables.reduce((n, t) => n + data[t].length, 0) });
});
app.post(`${prefix}/import/csv`, async (c) => {
  const b = z
    .object({
      transactions: z.array(transactionInput).min(1).max(500),
      confirmation: z.literal('IMPORT'),
    })
    .strict()
    .parse(await c.req.json());
  const data = await loadData(c.env.DB, c.get('user').id),
    rows = b.transactions.map((t) => record(t));
  rows.forEach((t) => validateTransaction(t as Transaction, data));
  validateDataset({ ...data, transactions: [...data.transactions, ...(rows as Transaction[])] });
  await c.env.DB.batch(bulkInsert(c.env.DB, c.get('user').id, 'transactions', rows));
  return c.json({ ok: true, records: rows.length }, 201);
});

export default app;
