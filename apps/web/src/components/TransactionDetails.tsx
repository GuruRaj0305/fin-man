import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, X } from 'lucide-react';
import type { Dataset, TransactionWithBalances } from '@folio/shared';
import { displayDate } from '../lib';
import { Money } from './ui';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TransactionDetails({
  transaction,
  data,
  onClose,
  onEdit,
}: {
  transaction: TransactionWithBalances;
  data: Dataset;
  onClose: () => void;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const account = data.accounts.find((a) => a.id === transaction.account_id),
    destination = data.accounts.find((a) => a.id === transaction.to_account_id),
    category = data.categories.find((c) => c.id === transaction.category_id),
    payment = data.loan_payments.find((p) => p.transaction_id === transaction.id),
    loan = payment && data.accounts.find((a) => a.id === payment.loan_id);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="transaction-details-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="transaction-details-title">Transaction details</h2>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body transaction-details">
        <div className="transaction-details-summary">
          <span className={`badge ${transaction.type}`}>{transaction.type}</span>
          <strong className={transaction.type === 'income' ? 'positive' : ''}>
            {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '−' : ''}
            <Money value={transaction.amount} currency={account?.currency} />
          </strong>
        </div>
        <dl className="transaction-details-grid">
          <Detail label="Date">{displayDate(transaction.date)}</Detail>
          <Detail label="Currency">{account?.currency ?? data.currency}</Detail>
          <Detail label={transaction.type === 'transfer' ? 'Sending account' : 'Account'}>
            {account?.name ?? 'Unavailable account'}
          </Detail>
          {transaction.type === 'transfer' ? (
            <Detail label="Receiving account">{destination?.name ?? 'Unavailable account'}</Detail>
          ) : (
            <Detail label="Category">{category?.name ?? 'Uncategorized'}</Detail>
          )}
          <Detail label={transaction.type === 'transfer' ? 'balance before' : 'Balance before'}>
            <Money value={transaction.balance_before} currency={account?.currency} />
          </Detail>
          <Detail label={transaction.type === 'transfer' ? 'balance after' : 'Balance after'}>
            <Money value={transaction.balance_after} currency={account?.currency} />
          </Detail>
          {transaction.to_balance_before !== null && transaction.to_balance_after !== null && (
            <>
              <Detail label="Receiving account balance before">
                <Money value={transaction.to_balance_before} currency={destination?.currency} />
              </Detail>
              <Detail label="Receiving account balance after">
                <Money value={transaction.to_balance_after} currency={destination?.currency} />
              </Detail>
            </>
          )}
        </dl>
        <dl className="transaction-details-content">
          <Detail label="Note">
            <p className="transaction-details-note">{transaction.note || 'No note added.'}</p>
          </Detail>
          <Detail label="Tags">
            {transaction.tags.length ? (
              <div className="tag-list">
                {transaction.tags.map((tag, index) => (
                  <span className="tag" key={`${tag}-${index}`}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              'No tags added.'
            )}
          </Detail>
          {payment && (
            <Detail label="Loan payment">
              <p>
                {loan?.name ?? 'Loan'} · {payment.kind === 'emi' ? 'EMI' : 'Prepayment'}
              </p>
              <p>
                Principal: <Money value={payment.principal} currency={account?.currency} />
                {' · '}
                Interest: <Money value={payment.interest} currency={account?.currency} />
              </p>
              <Link className="text-btn" to={`/loans/${payment.loan_id}`} onClick={onClose}>
                View loan and manage payments
              </Link>
            </Detail>
          )}
          <Detail label="Created">
            <time dateTime={transaction.created_at}>
              {new Intl.DateTimeFormat('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(transaction.created_at))}
            </time>
          </Detail>
          <Detail label="Transaction ID">{transaction.id}</Detail>
        </dl>
      </div>
      <div className="dialog-actions">
        <button className="btn secondary" onClick={onClose}>
          Close
        </button>
        {!payment && (
          <button className="btn primary" onClick={onEdit} disabled={!navigator.onLine}>
            <Pencil size={15} />
            Edit transaction
          </button>
        )}
      </div>
    </dialog>
  );
}
