PRAGMA foreign_keys = ON;
CREATE TABLE users (id INTEGER PRIMARY KEY CHECK(id=1), password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE accounts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('savings','bank','cash','loan','investment')),
 opening_balance INTEGER NOT NULL CHECK(typeof(opening_balance)='integer'), currency TEXT NOT NULL DEFAULT 'INR', archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 principal INTEGER, rate_bps INTEGER, tenure_months INTEGER, emi INTEGER, start_date TEXT, lender TEXT, created_at TEXT NOT NULL
);
CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('income','expense')), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at TEXT NOT NULL);
CREATE UNIQUE INDEX category_name ON categories(lower(name),type);
CREATE TABLE transactions (
 id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0),
 account_id TEXT NOT NULL REFERENCES accounts(id), to_account_id TEXT REFERENCES accounts(id), category_id TEXT REFERENCES categories(id),
 note TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
 CHECK ((type='transfer' AND to_account_id IS NOT NULL AND account_id<>to_account_id AND category_id IS NULL) OR (type<>'transfer' AND to_account_id IS NULL AND category_id IS NOT NULL))
);
CREATE INDEX transactions_date ON transactions(date);
CREATE INDEX transactions_account ON transactions(account_id,date);
CREATE INDEX transactions_target ON transactions(to_account_id,date);
CREATE INDEX transactions_category ON transactions(category_id,date);
CREATE TABLE loan_payments (
 id TEXT PRIMARY KEY, loan_id TEXT NOT NULL REFERENCES accounts(id), transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
 date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('emi','prepayment')), amount INTEGER NOT NULL,
 principal INTEGER NOT NULL CHECK(typeof(principal)='integer' AND principal>=0), interest INTEGER NOT NULL CHECK(typeof(interest)='integer' AND interest>=0), created_at TEXT NOT NULL,
 CHECK(amount=principal+interest AND amount>0)
);
CREATE INDEX payments_loan ON loan_payments(loan_id,date);
CREATE TABLE holdings (id TEXT PRIMARY KEY, name TEXT NOT NULL, asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','mutual_fund','fd','gold','crypto','other')), units TEXT, created_at TEXT NOT NULL);
CREATE TABLE investment_entries (id TEXT PRIMARY KEY, holding_id TEXT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE, date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('buy','sell')), amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), units TEXT, created_at TEXT NOT NULL);
CREATE INDEX entries_holding ON investment_entries(holding_id,date);
CREATE TABLE valuations (id TEXT PRIMARY KEY, holding_id TEXT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE, date TEXT NOT NULL, value INTEGER NOT NULL CHECK(typeof(value)='integer' AND value>=0), created_at TEXT NOT NULL);
CREATE INDEX valuations_holding ON valuations(holding_id,date,created_at);
CREATE TABLE goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_amount INTEGER NOT NULL CHECK(typeof(target_amount)='integer' AND target_amount>0), target_date TEXT NOT NULL, account_id TEXT REFERENCES accounts(id), created_at TEXT NOT NULL);
CREATE TABLE contributions (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE budgets (id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), month TEXT NOT NULL, amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), created_at TEXT NOT NULL, UNIQUE(category_id,month));

INSERT INTO categories (id,name,type,created_at) VALUES
 ('cat_salary','Salary','income',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_freelance','Freelance','income',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cat_interest','Interest','income',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_income_other','Other','income',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cat_rent','Rent','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_food','Food','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cat_transport','Transport','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_utilities','Utilities','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cat_shopping','Shopping','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_health','Health','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cat_education','Education','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_entertainment','Entertainment','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cat_emi','EMI','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cat_expense_other','Other','expense',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
