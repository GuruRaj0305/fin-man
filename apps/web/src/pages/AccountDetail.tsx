import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from 'lucide-react';
import type { AccountDetail as AccountDetailData } from '@folio/shared';
import { useWorkspace } from '../App';
import { api, ApiError, displayDate, useSave } from '../lib';
import { AccountDialog, archiveAccount } from '../components/forms';
import {
  DeleteButton,
  Empty,
  ErrorState,
  Loading,
  Money,
  PageHeading,
  SectionTitle,
} from '../components/ui';
import { TransactionList } from './Transactions';

export function AccountDetail() {
  const { id = '' } = useParams(),
    { user } = useWorkspace(),
    navigate = useNavigate(),
    save = useSave(),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(''),
    detail = useQuery({
      queryKey: ['account-details', user.id, id],
      queryFn: ({ signal }) =>
        api<AccountDetailData>(`/accounts/${encodeURIComponent(id)}`, 'GET', undefined, signal),
      enabled: !!id,
      retry: false,
    });
  const back = (
    <Link className="back-link" to="/accounts">
      <ArrowLeft size={15} />
      All accounts
    </Link>
  );
  if (detail.isPending)
    return (
      <>
        {back}
        <Loading />
      </>
    );
  if (detail.isError)
    return (
      <>
        {back}
        {detail.error instanceof ApiError && detail.error.status === 404 ? (
          <Empty title="Account not found">This account is not available in your workspace.</Empty>
        ) : (
          <ErrorState error={detail.error} retry={() => void detail.refetch()} />
        )}
      </>
    );
  const { account, stats, goals, delete_reason: deleteReason } = detail.data;
  if (account.type === 'loan') return <Navigate to={`/loans/${account.id}`} replace />;
  return (
    <>
      {back}
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title={account.name}
        description={`${stats.transaction_count} ${stats.transaction_count === 1 ? 'transaction' : 'transactions'} recorded`}
        action={
          <div className="heading-actions">
            <button
              className="icon-btn"
              aria-label={`Edit ${account.name}`}
              title="Edit account"
              disabled={!navigator.onLine}
              onClick={() => setEditing(true)}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              className="icon-btn"
              aria-label={`${account.archived ? 'Restore' : 'Archive'} ${account.name}`}
              title={account.archived ? 'Restore account' : 'Archive account'}
              disabled={!navigator.onLine || save.isPending}
              onClick={async () => {
                setError('');
                try {
                  await archiveAccount(save, account);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              {account.archived ? (
                <ArchiveRestore size={16} aria-hidden="true" />
              ) : (
                <Archive size={16} aria-hidden="true" />
              )}
            </button>
            <DeleteButton
              path={`/accounts/${account.id}`}
              label={`Delete ${account.name}`}
              iconOnly
              disabledReason={deleteReason ?? undefined}
              onDone={() => navigate('/accounts')}
            />
          </div>
        }
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel account-detail-summary">
        <div className="account-detail-balance">
          <small>Current balance</small>
          <strong>
            <Money value={account.balance} currency={account.currency} />
          </strong>
          <p className="muted small">
            Opening balance <Money value={account.opening_balance} currency={account.currency} />
          </p>
        </div>
        <dl className="account-detail-meta">
          <div>
            <dt>Type</dt>
            <dd>{account.type === 'bank' ? 'Current account' : account.type}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{account.currency}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{account.archived ? 'Archived' : 'Active'}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{displayDate(account.created_at)}</dd>
          </div>
        </dl>
      </section>
      <div
        className="metric-grid account-activity-metrics"
        aria-label="All recorded account activity"
      >
        {[
          { label: 'Total income', amount: stats.income },
          { label: 'Total expenses', amount: stats.expense },
          { label: 'Transfers received', amount: stats.transfer_in },
          { label: 'Transfers sent', amount: stats.transfer_out },
        ].map((metric) => (
          <div className="panel metric" key={metric.label}>
            <small>{metric.label}</small>
            <strong>
              <Money value={metric.amount} currency={account.currency} />
            </strong>
          </div>
        ))}
      </div>
      {account.archived && (
        <div className="info-card">
          <Archive size={20} />
          <p>
            This account is archived. Its history remains available. Restore the account to add
            transactions.
          </p>
        </div>
      )}
      <TransactionList key={account.id} accountId={account.id} />
      {!!goals.length && (
        <section className="panel account-linked-goals">
          <SectionTitle
            title="Linked savings goals"
            action={
              <Link className="text-link" to="/goals">
                Manage goals
              </Link>
            }
          />
          <ul>
            {goals.map((goal) => (
              <li key={goal.id}>
                <div>
                  <strong>{goal.name}</strong>
                  <small className="block muted">Target date {displayDate(goal.target_date)}</small>
                </div>
                <span>
                  <Money value={goal.target_amount} currency={account.currency} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && <AccountDialog existing={account} onClose={() => setEditing(false)} />}
    </>
  );
}
