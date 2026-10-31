import { workerEnvironment } from './runtime.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url)),
  api = `${root}apps/api`;
const mode = process.argv[2],
  e2e = process.argv.includes('--e2e');
const persistence = e2e ? `${root}.local/e2e-d1` : `${api}/.wrangler/state`;
function run(args) {
  const r = spawnSync(
    process.execPath,
    [
      `${root}node_modules/wrangler/bin/wrangler.js`,
      ...args,
      '--local',
      '--persist-to',
      persistence,
    ],
    {
      cwd: api,
      stdio: 'inherit',
      env: workerEnvironment(),
    },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (mode === 'reset') {
  // This script has no remote mode and can only remove these dedicated local directories.
  rmSync(persistence, { recursive: true, force: true });
  run(['d1', 'migrations', 'apply', 'DB']);
  console.log(
    e2e
      ? 'Reset isolated E2E database.'
      : 'Reset local database. No Cloudflare resources were accessed.',
  );
} else if (mode === 'seed') {
  mkdirSync(`${root}.local`, { recursive: true });
  const now = new Date(),
    stamp = now.toISOString(),
    date = (offset, day) =>
      new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, day))
        .toISOString()
        .slice(0, 10);
  const acc = (id, name, type, balance, extra = {}) => ({
    id,
    name,
    type,
    opening_balance: balance,
    currency: 'INR',
    archived: 0,
    principal: null,
    rate_bps: null,
    tenure_months: null,
    emi: null,
    start_date: null,
    lender: null,
    created_at: `${date(-3, 1)}T00:00:00.000Z`,
    ...extra,
  });
  const accounts = [
    acc('demo_bank', 'Everyday account', 'bank', 1850000),
    acc('demo_savings', 'Rainy day fund', 'savings', 15000000),
    acc('demo_cash', 'Wallet', 'cash', 450000),
    acc('demo_loan', 'Car loan', 'loan', 0, {
      principal: 50000000,
      rate_bps: 850,
      tenure_months: 60,
      emi: 1025830,
      start_date: date(-3, 1),
      lender: 'Local bank',
    }),
  ];
  const transactions = [];
  const tx = (offset, day, type, amount, category, note, account = 'demo_bank', to = null) =>
    transactions.push({
      id: randomUUID(),
      date: date(offset, day),
      type,
      amount,
      account_id: account,
      to_account_id: to,
      category_id: category,
      note,
      tags: '[]',
      created_at: stamp,
    });
  for (let m = -2; m <= 0; m++) {
    tx(m, 1, 'income', 12500000, 'cat_salary', 'Monthly salary');
    tx(m, 3, 'expense', 2800000, 'cat_rent', 'Home, sweet home');
    tx(m, 4, 'expense', 285000, 'cat_food', 'Groceries');
    tx(m, 7, 'expense', 145000, 'cat_transport', 'Fuel & commute');
    tx(m, 9, 'expense', 360000, 'cat_utilities', 'Electricity & internet');
    tx(m, 10, 'income', 1200000, 'cat_freelance', 'Weekend design project');
    tx(m, 12, 'expense', 190000, 'cat_entertainment', 'A little weekend joy');
    tx(m, 15, 'expense', 420000, 'cat_shopping', 'Things for home');
    tx(m, 16, 'expense', 110000, 'cat_food', 'Dinner with friends');
    tx(m, 18, 'transfer', 1800000, null, 'Monthly savings', 'demo_bank', 'demo_savings');
  }
  const holdings = [
    {
      id: 'demo_index',
      name: 'Nifty 50 index fund',
      asset_type: 'mutual_fund',
      units: '248.5',
      created_at: stamp,
    },
    { id: 'demo_gold', name: 'Sovereign gold', asset_type: 'gold', units: '12', created_at: stamp },
    { id: 'demo_fd', name: 'A little certainty', asset_type: 'fd', units: null, created_at: stamp },
  ];
  const entries = [],
    valuations = [];
  for (const [i, h] of holdings.entries())
    for (let m = -2; m <= 0; m++) {
      entries.push({
        id: randomUUID(),
        holding_id: h.id,
        date: date(m, 2),
        kind: 'buy',
        amount: [1000000, 400000, 1500000][i],
        units: null,
        created_at: stamp,
      });
      valuations.push({
        id: randomUUID(),
        holding_id: h.id,
        date: date(m, 19),
        value: Math.round([1080000, 430000, 1520000][i] * (m + 3)),
        created_at: stamp,
      });
    }
  const goals = [
    {
      id: 'demo_goal',
      name: 'The freedom fund',
      target_amount: 50000000,
      target_date: date(18, 1),
      account_id: 'demo_savings',
      created_at: stamp,
    },
  ];
  const budgets = [
    ['cat_food', 1500000],
    ['cat_shopping', 500000],
    ['cat_transport', 600000],
    ['cat_entertainment', 400000],
  ].map(([cat, amount]) => ({
    id: randomUUID(),
    category_id: cat,
    month: date(0, 1).slice(0, 7),
    amount,
    created_at: stamp,
  }));
  const quote = (v) =>
    v === null
      ? 'NULL'
      : typeof v === 'number'
        ? String(v)
        : `'${String(v).replaceAll("'", "''")}'`;
  const sqlInsert = (table, rows) =>
    rows
      .map(
        (row) =>
          `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});`,
      )
      .join('\n');
  // The CHECK guard aborts before demo inserts if any finance data exists.
  const sql = `CREATE TABLE IF NOT EXISTS seed_guard(value INTEGER CHECK(value=0));\nINSERT INTO seed_guard SELECT (SELECT COUNT(*) FROM accounts)+(SELECT COUNT(*) FROM holdings)+(SELECT COUNT(*) FROM transactions)+(SELECT COUNT(*) FROM goals)+(SELECT COUNT(*) FROM budgets);\n${[
    ['accounts', accounts],
    ['transactions', transactions],
    ['holdings', holdings],
    ['investment_entries', entries],
    ['valuations', valuations],
    ['goals', goals],
    ['budgets', budgets],
  ]
    .map(([t, r]) => sqlInsert(t, r))
    .join('\n')}\nDROP TABLE seed_guard;`;
  const path = `${root}.local/demo-seed.sql`;
  writeFileSync(path, sql);
  run(['d1', 'execute', 'DB', '--file', path]);
  console.log(
    'Demo data inserted locally. Set your own password in the browser. Reset local data before entering real finances.',
  );
} else throw new Error('Use seed or reset');
