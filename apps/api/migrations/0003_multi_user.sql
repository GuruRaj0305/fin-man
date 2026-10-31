-- Preserve the owner, password and active sessions while removing the single-user constraint.
CREATE TABLE users_next (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
 email TEXT COLLATE NOCASE UNIQUE, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT,
 CHECK(email IS NOT NULL OR id=1)
);
INSERT INTO users_next(id,name,email,role,password_hash,created_at)
 SELECT id,'Owner',NULL,'admin',password_hash,created_at FROM users;
-- Copy sessions before dropping their old parent; defer_foreign_keys does not disable cascades.
CREATE TABLE sessions_next (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users_next(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL
);
INSERT INTO sessions_next SELECT * FROM sessions;
DROP TABLE sessions;
DROP TABLE users;
ALTER TABLE users_next RENAME TO users;
ALTER TABLE sessions_next RENAME TO sessions;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_user ON sessions(user_id,expires_at,absolute_expires_at);
CREATE INDEX users_created ON users(created_at,id);

-- Existing finance rows retain their IDs and belong to the original owner.
ALTER TABLE accounts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX accounts_user ON accounts(user_id);
ALTER TABLE categories ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX categories_user ON categories(user_id);
ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX transactions_user ON transactions(user_id);
ALTER TABLE holdings ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX holdings_user ON holdings(user_id);
ALTER TABLE investment_entries ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX investment_entries_user ON investment_entries(user_id);
ALTER TABLE valuations ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX valuations_user ON valuations(user_id);
ALTER TABLE goals ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX goals_user ON goals(user_id);
ALTER TABLE contributions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX contributions_user ON contributions(user_id);
ALTER TABLE budgets ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX budgets_user ON budgets(user_id);
ALTER TABLE loan_payments ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 CHECK(user_id>0);
CREATE INDEX loan_payments_user ON loan_payments(user_id);
DROP INDEX category_name;
CREATE UNIQUE INDEX category_name ON categories(user_id,lower(name),type);

-- Ownership is immutable, including when an import uses ON CONFLICT.
CREATE TRIGGER accounts_owner_insert BEFORE INSERT ON accounts
WHEN EXISTS(SELECT 1 FROM accounts WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER accounts_owner_update BEFORE UPDATE ON accounts
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER categories_owner_insert BEFORE INSERT ON categories
WHEN EXISTS(SELECT 1 FROM categories WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER categories_owner_update BEFORE UPDATE ON categories
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER transactions_owner_insert BEFORE INSERT ON transactions
WHEN EXISTS(SELECT 1 FROM transactions WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER transactions_owner_update BEFORE UPDATE ON transactions
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER holdings_owner_insert BEFORE INSERT ON holdings
WHEN EXISTS(SELECT 1 FROM holdings WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER holdings_owner_update BEFORE UPDATE ON holdings
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER investment_entries_owner_insert BEFORE INSERT ON investment_entries
WHEN EXISTS(SELECT 1 FROM investment_entries WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER investment_entries_owner_update BEFORE UPDATE ON investment_entries
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER valuations_owner_insert BEFORE INSERT ON valuations
WHEN EXISTS(SELECT 1 FROM valuations WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER valuations_owner_update BEFORE UPDATE ON valuations
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER goals_owner_insert BEFORE INSERT ON goals
WHEN EXISTS(SELECT 1 FROM goals WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER goals_owner_update BEFORE UPDATE ON goals
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER contributions_owner_insert BEFORE INSERT ON contributions
WHEN EXISTS(SELECT 1 FROM contributions WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER contributions_owner_update BEFORE UPDATE ON contributions
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER budgets_owner_insert BEFORE INSERT ON budgets
WHEN EXISTS(SELECT 1 FROM budgets WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER budgets_owner_update BEFORE UPDATE ON budgets
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER loan_payments_owner_insert BEFORE INSERT ON loan_payments
WHEN EXISTS(SELECT 1 FROM loan_payments WHERE id=NEW.id AND user_id<>NEW.user_id)
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;
CREATE TRIGGER loan_payments_owner_update BEFORE UPDATE ON loan_payments
WHEN NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'record ownership mismatch'); END;

-- Foreign-key IDs must also belong to the same workspace.
CREATE TRIGGER transactions_references_insert BEFORE INSERT ON transactions
WHEN (NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND user_id=NEW.user_id)) OR (NEW.to_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.to_account_id AND user_id=NEW.user_id)) OR (NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER transactions_references_update BEFORE UPDATE ON transactions
WHEN (NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND user_id=NEW.user_id)) OR (NEW.to_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.to_account_id AND user_id=NEW.user_id)) OR (NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER loan_payments_references_insert BEFORE INSERT ON loan_payments
WHEN (NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.loan_id AND user_id=NEW.user_id)) OR (NOT EXISTS(SELECT 1 FROM transactions WHERE id=NEW.transaction_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER loan_payments_references_update BEFORE UPDATE ON loan_payments
WHEN (NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.loan_id AND user_id=NEW.user_id)) OR (NOT EXISTS(SELECT 1 FROM transactions WHERE id=NEW.transaction_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER investment_entries_references_insert BEFORE INSERT ON investment_entries
WHEN (NOT EXISTS(SELECT 1 FROM holdings WHERE id=NEW.holding_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER investment_entries_references_update BEFORE UPDATE ON investment_entries
WHEN (NOT EXISTS(SELECT 1 FROM holdings WHERE id=NEW.holding_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER valuations_references_insert BEFORE INSERT ON valuations
WHEN (NOT EXISTS(SELECT 1 FROM holdings WHERE id=NEW.holding_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER valuations_references_update BEFORE UPDATE ON valuations
WHEN (NOT EXISTS(SELECT 1 FROM holdings WHERE id=NEW.holding_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER goals_references_insert BEFORE INSERT ON goals
WHEN (NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER goals_references_update BEFORE UPDATE ON goals
WHEN (NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER contributions_references_insert BEFORE INSERT ON contributions
WHEN (NOT EXISTS(SELECT 1 FROM goals WHERE id=NEW.goal_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER contributions_references_update BEFORE UPDATE ON contributions
WHEN (NOT EXISTS(SELECT 1 FROM goals WHERE id=NEW.goal_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER budgets_references_insert BEFORE INSERT ON budgets
WHEN (NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
CREATE TRIGGER budgets_references_update BEFORE UPDATE ON budgets
WHEN (NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'workspace reference constraint'); END;
