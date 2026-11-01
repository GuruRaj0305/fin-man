import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Eye, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Page, Transaction, TransactionWithBalances } from '@folio/shared';
import { useWorkspace } from '../App';
import { api, download, displayDate } from '../lib';
import {
  PageHeading,
  AddButton,
  Money,
  Empty,
  Loading,
  ErrorState,
  DeleteButton,
  SectionTitle,
} from '../components/ui';
import { TransactionDialog } from '../components/forms';
import { TransactionDetails } from '../components/TransactionDetails';
export function Transactions() {
  return <TransactionList />;
}
export function TransactionList({ accountId: scopedAccountId }: { accountId?: string }) {
  const { data, user } = useWorkspace(),
    [search, setSearch] = useState(''),
    deferred = useDeferredValue(search),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [account, setAccount] = useState(''),
    [category, setCategory] = useState(''),
    [type, setType] = useState(''),
    [page, setPage] = useState(1),
    [details, setDetails] = useState<TransactionWithBalances | null>(null),
    [edit, setEdit] = useState<Transaction | true | null>(null),
    [exportError, setExportError] = useState('');
  const selectedAccount = data.accounts.find((account) => account.id === scopedAccountId),
    effectiveAccountId = scopedAccountId ?? account;
  const query = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(deferred ? { search: deferred } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(effectiveAccountId ? { account_id: effectiveAccountId } : {}),
    ...(category ? { category_id: category } : {}),
    ...(type ? { type } : {}),
  });
  const transactions = useQuery({
    queryKey: ['transactions', user.id, query.toString()],
    queryFn: ({ signal }) =>
      api<Page<TransactionWithBalances>>(`/transactions?${query}`, 'GET', undefined, signal),
  });
  const update = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const currentDetails =
    details &&
    (transactions.data?.data.find((transaction) => transaction.id === details.id) ?? details);
  return (
    <>
      {!scopedAccountId && (
        <PageHeading
          eyebrow="THE DAY-TO-DAY"
          title="Every little entry matters."
          description="A clear view of what comes in, goes out, and moves around."
          action={<AddButton onClick={() => setEdit(true)}>Add transaction</AddButton>}
        />
      )}
      <section className="panel">
        {scopedAccountId && (
          <SectionTitle
            title="Transactions"
            description="All entries involving this account, including transfers."
            action={
              selectedAccount?.archived ? (
                <span className="hint">Restore this account to add transactions.</span>
              ) : (
                <AddButton onClick={() => setEdit(true)}>Add transaction</AddButton>
              )
            }
          />
        )}
        <div className="filter-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Search transactions"
              placeholder="Search notes, tags, categories…"
              value={search}
              onChange={(e) => update(setSearch, e.target.value)}
            />
          </label>
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                await download(`/export/transactions.csv?${query}`, 'folio-transactions.csv');
              } catch (e) {
                setExportError((e as Error).message);
              }
            }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
        <div className={`filters${scopedAccountId ? ' account-transaction-filters' : ''}`}>
          <label>
            From
            <input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(e) => update(setFrom, e.target.value)}
            />
          </label>
          <label>
            To
            <input
              aria-label="To date"
              type="date"
              value={to}
              onChange={(e) => update(setTo, e.target.value)}
            />
          </label>
          {!scopedAccountId && (
            <label>
              Account
              <select
                aria-label="Filter by account"
                value={account}
                onChange={(e) => update(setAccount, e.target.value)}
              >
                <option value="">All accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Category
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => update(setCategory, e.target.value)}
            >
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Filter by type"
              value={type}
              onChange={(e) => update(setType, e.target.value)}
            >
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>
        </div>
        {exportError && (
          <p className="form-error" role="alert">
            {exportError}
          </p>
        )}
        {transactions.isPending ? (
          <Loading />
        ) : transactions.isError ? (
          <ErrorState error={transactions.error} />
        ) : transactions.data.data.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th className="align-right">Amount</th>
                    <th className="align-right">Balance before</th>
                    <th className="align-right">Balance after</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.data.data.map((t) => {
                    const a = data.accounts.find((a) => a.id === t.account_id),
                      linked = data.loan_payments.some((p) => p.transaction_id === t.id),
                      incoming =
                        !!scopedAccountId &&
                        t.type === 'transfer' &&
                        t.to_account_id === scopedAccountId,
                      positive = t.type === 'income' || incoming,
                      before = incoming
                        ? (t.to_balance_before ?? t.balance_before)
                        : t.balance_before,
                      after = incoming ? (t.to_balance_after ?? t.balance_after) : t.balance_after;
                    return (
                      <tr key={t.id}>
                        <td className="nowrap muted">{displayDate(t.date)}</td>
                        <td>
                          <button
                            className="transaction-title"
                            aria-label={`View transaction: ${t.note || t.type}`}
                            onClick={() => setDetails(t)}
                          >
                            <strong>{t.note || t.type}</strong>
                          </button>
                          <div className="tag-list">
                            {t.tags.map((tag) => (
                              <span key={tag} className="tag">
                                {tag}
                              </span>
                            ))}
                            {linked && <span className="tag">Loan payment</span>}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${t.type}`}>
                            {t.type === 'transfer' && scopedAccountId
                              ? incoming
                                ? 'Transfer in'
                                : 'Transfer out'
                              : (data.categories.find((c) => c.id === t.category_id)?.name ??
                                'Transfer')}
                          </span>
                        </td>
                        <td>
                          {a?.name}
                          {t.to_account_id && (
                            <small className="block muted">
                              → {data.accounts.find((a) => a.id === t.to_account_id)?.name}
                            </small>
                          )}
                        </td>
                        <td className={`align-right amount-cell ${positive ? 'positive' : ''}`}>
                          {positive ? '+' : t.type === 'expense' || scopedAccountId ? '−' : ''}
                          <Money value={t.amount} currency={a?.currency} />
                        </td>
                        {[
                          {
                            key: 'before',
                            amount: before,
                            destination: scopedAccountId ? null : t.to_balance_before,
                          },
                          {
                            key: 'after',
                            amount: after,
                            destination: scopedAccountId ? null : t.to_balance_after,
                          },
                        ].map((balance) => (
                          <td className="align-right balance-cell" key={balance.key}>
                            <span className="sr-only">{selectedAccount?.name ?? a?.name}: </span>
                            <Money value={balance.amount} currency={a?.currency} />
                            {balance.destination !== null && (
                              <small className="block muted">
                                <span className="sr-only">
                                  {data.accounts.find((a) => a.id === t.to_account_id)?.name}:{' '}
                                </span>
                                <Money value={balance.destination} currency={a?.currency} />
                              </small>
                            )}
                          </td>
                        ))}
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              aria-label={`View details for ${t.note || t.type}`}
                              title="View details"
                              onClick={() => setDetails(t)}
                            >
                              <Eye size={15} aria-hidden="true" />
                            </button>
                            {!linked && (
                              <button
                                className="icon-btn"
                                aria-label={`Edit ${t.note || t.type}`}
                                onClick={() => setEdit(t)}
                                disabled={!navigator.onLine}
                              >
                                <Pencil size={15} />
                              </button>
                            )}
                            <DeleteButton path={`/transactions/${t.id}`} iconOnly />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {transactions.data.total} entries · page {page} of{' '}
                {Math.max(1, Math.ceil(transactions.data.total / 20))}
              </span>
              <div>
                <button
                  className="icon-btn"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Next page"
                  disabled={page * 20 >= transactions.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="Nothing here just yet">
            Add a transaction or adjust your filters to find an entry.
          </Empty>
        )}
      </section>
      {currentDetails && (
        <TransactionDetails
          transaction={currentDetails}
          data={data}
          onClose={() => setDetails(null)}
          onEdit={() => {
            setDetails(null);
            setEdit(currentDetails);
          }}
        />
      )}
      {edit && (
        <TransactionDialog
          data={data}
          userId={user.id}
          existing={edit === true ? undefined : edit}
          defaultAccountId={scopedAccountId}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}
