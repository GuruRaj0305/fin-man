-- Re-check allocation inside the database write to protect against two tabs
-- recording payments concurrently after reading the same outstanding balance.
CREATE TRIGGER loan_payment_guard BEFORE INSERT ON loan_payments
WHEN NOT EXISTS (SELECT 1 FROM loan_payments WHERE id=NEW.id)
BEGIN
  SELECT CASE
    WHEN NEW.date < COALESCE((SELECT MAX(date) FROM loan_payments WHERE loan_id=NEW.loan_id),'0000-01-01')
      THEN RAISE(ABORT,'loan payment must be chronological')
    WHEN NEW.principal > (SELECT principal FROM accounts WHERE id=NEW.loan_id) - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id=NEW.loan_id),0)
      THEN RAISE(ABORT,'loan payment exceeds outstanding principal')
    WHEN NEW.interest != CASE WHEN NEW.kind='prepayment' THEN 0 ELSE
      ( ((SELECT principal FROM accounts WHERE id=NEW.loan_id) - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id=NEW.loan_id),0)) * (SELECT rate_bps FROM accounts WHERE id=NEW.loan_id) + 60000 ) / 120000 END
      THEN RAISE(ABORT,'loan payment allocation changed; retry')
  END;
END;
