import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Page, Transaction } from '@folio/shared';
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
} from '../components/ui';
import { TransactionDialog } from '../components/forms';
export function Transactions() {
  const { data } = useWorkspace(),
    [search, setSearch] = useState(''),
    deferred = useDeferredValue(search),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [account, setAccount] = useState(''),
    [category, setCategory] = useState(''),
    [type, setType] = useState(''),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Transaction | true | null>(null),
    [exportError, setExportError] = useState('');
  const query = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(deferred ? { search: deferred } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(account ? { account_id: account } : {}),
    ...(category ? { category_id: category } : {}),
    ...(type ? { type } : {}),
  });
  const transactions = useQuery({
    queryKey: ['transactions', query.toString()],
    queryFn: () => api<Page<Transaction>>(`/transactions?${query}`),
  });
  const update = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <>
      <PageHeading
        eyebrow="THE DAY-TO-DAY"
        title="Every little entry matters."
        description="A clear view of what comes in, goes out, and moves around."
        action={<AddButton onClick={() => setEdit(true)}>Add transaction</AddButton>}
      />
      <section className="panel">
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
        <div className="filters">
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
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.data.data.map((t) => {
                    const a = data.accounts.find((a) => a.id === t.account_id),
                      linked = data.loan_payments.some((p) => p.transaction_id === t.id);
                    return (
                      <tr key={t.id}>
                        <td className="nowrap muted">{displayDate(t.date)}</td>
                        <td>
                          <strong>{t.note || t.type}</strong>
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
                            {data.categories.find((c) => c.id === t.category_id)?.name ??
                              'Transfer'}
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
                        <td
                          className={`align-right amount-cell ${t.type === 'income' ? 'positive' : ''}`}
                        >
                          {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                          <Money value={t.amount} currency={a?.currency} />
                        </td>
                        <td>
                          <div className="row-actions">
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
                            <DeleteButton path={`/transactions/${t.id}`} />
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
      {edit && (
        <TransactionDialog
          data={data}
          existing={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}
