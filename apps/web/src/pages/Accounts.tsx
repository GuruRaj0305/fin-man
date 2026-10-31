import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  WalletCards,
  Landmark,
  Banknote,
  ArrowUpRight,
  Pencil,
  ArrowLeft,
  CalendarDays,
} from 'lucide-react';
import { accountBalance, monthlyInterest, type Account } from '@folio/shared';
import { useWorkspace } from '../App';
import { useSave, displayDate, today, percent } from '../lib';
import { AccountDialog, archiveAccount } from '../components/forms';
import {
  PageHeading,
  AddButton,
  Money,
  Empty,
  DeleteButton,
  Progress,
  SectionTitle,
  Dialog,
  Field,
  AmountField,
  amount,
  str,
} from '../components/ui';

export function Accounts() {
  const { data } = useWorkspace(),
    [edit, setEdit] = useState<Account | true | null>(null),
    [showArchived, setShowArchived] = useState(false),
    [error, setError] = useState(''),
    save = useSave();
  const accounts = data.accounts.filter((a) => a.type !== 'loan' && (showArchived || !a.archived));
  return (
    <>
      <PageHeading
        eyebrow="A PLACE FOR EVERYTHING"
        title="Your money, at a glance."
        description="From the everyday essentials to the rainy day fund."
        action={<AddButton onClick={() => setEdit(true)}>Add account</AddButton>}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived accounts
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {accounts.length ? (
        <div className="card-grid">
          {accounts.map((a) => (
            <section className={`panel account-card ${a.archived ? 'archived' : ''}`} key={a.id}>
              <div className="card-top">
                <span className="large-icon">
                  {a.type === 'cash' ? (
                    <Banknote size={23} />
                  ) : a.type === 'savings' ? (
                    <WalletCards size={23} />
                  ) : (
                    <Landmark size={23} />
                  )}
                </span>
                <span className="pill">
                  {a.archived ? 'Archived' : a.type === 'bank' ? 'Current account' : a.type}
                </span>
              </div>
              <h2>{a.name}</h2>
              <div className="account-balance">
                <Money value={accountBalance(a, data.transactions)} currency={a.currency} />
              </div>
              <p className="muted small">
                Opening balance <Money value={a.opening_balance} currency={a.currency} />
              </p>
              <div className="card-footer">
                <button className="text-btn" onClick={() => setEdit(a)}>
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  className="text-btn"
                  onClick={async () => {
                    try {
                      await archiveAccount(save, a);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {a.archived ? 'Restore' : 'Archive'}
                </button>
                <DeleteButton path={`/accounts/${a.id}`} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Your money needs a home"
            action={<AddButton onClick={() => setEdit(true)}>Add your first account</AddButton>}
          >
            Add your bank account, savings, or cash wallet to get started.
          </Empty>
        </section>
      )}
      <div className="info-card">
        <WalletCards size={22} />
        <p>
          Balances include your opening amount and all recorded transactions. Transfers move money
          between accounts without affecting income or expenses. Investment cash and manually
          tracked holdings are separate assets.
        </p>
      </div>
      {edit && (
        <AccountDialog existing={edit === true ? undefined : edit} onClose={() => setEdit(null)} />
      )}
    </>
  );
}
export function Loans() {
  const { current: view } = useWorkspace(),
    [add, setAdd] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="ONE PAYMENT AT A TIME"
        title="A little closer to debt-free."
        description="Know what you owe, and see how far you’ve come."
        action={<AddButton onClick={() => setAdd(true)}>Add loan</AddButton>}
      />
      {view.loans.length ? (
        <div className="card-grid">
          {view.loans.map((l) => (
            <section className="panel loan-card" key={l.loan.id}>
              <div className="card-top">
                <span className="large-icon">
                  <Landmark size={23} />
                </span>
                <span className="pill">{l.outstanding ? 'In progress' : 'Paid off'}</span>
              </div>
              <Link to={`/loans/${l.loan.id}`} className="card-title">
                <h2>{l.loan.name}</h2>
                <ArrowUpRight size={18} />
              </Link>
              <p className="muted">
                {l.loan.lender || 'Personal loan'} · {percent(l.loan.rate_bps! / 100)} p.a.
              </p>
              <div className="account-balance">
                <Money value={l.outstanding} currency={l.loan.currency} />
              </div>
              <small className="muted">Outstanding principal</small>
              <div className="progress-label">
                <span>{percent(l.progress)} repaid</span>
                <span>{l.remaining_months} payments left</span>
              </div>
              <Progress value={l.progress} label={`${l.loan.name} repaid`} />
              <div className="loan-card-footer">
                <span>
                  Monthly EMI{' '}
                  <strong>
                    <Money value={l.loan.emi!} currency={l.loan.currency} />
                  </strong>
                </span>
                <Link to={`/loans/${l.loan.id}`} className="text-link">
                  View journey
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="A clear path forward"
            action={<AddButton onClick={() => setAdd(true)}>Add your first loan</AddButton>}
          >
            Track a loan and we’ll help you see the journey to your last payment.
          </Empty>
        </section>
      )}
      {add && <AccountDialog loan onClose={() => setAdd(false)} />}
    </>
  );
}
export function LoanDetail() {
  const { id } = useParams(),
    { data, current: view } = useWorkspace(),
    save = useSave(),
    [pay, setPay] = useState(false),
    [edit, setEdit] = useState(false),
    [limit, setLimit] = useState(24);
  const l = view.loans.find((l) => l.loan.id === id);
  if (!l)
    return (
      <Empty title="Loan not found">
        <Link to="/loans">Back to loans</Link>
      </Empty>
    );
  return (
    <>
      <Link className="back-link" to="/loans">
        <ArrowLeft size={15} />
        All loans
      </Link>
      <PageHeading
        eyebrow="YOUR REPAYMENT JOURNEY"
        title={l.loan.name}
        description={`${l.loan.lender ?? 'Personal loan'} · Started ${displayDate(l.loan.start_date!)}`}
        action={
          <div className="heading-actions">
            <button className="btn secondary" onClick={() => setEdit(true)}>
              Edit loan
            </button>
            <AddButton onClick={() => setPay(true)}>Record payment</AddButton>
          </div>
        }
      />
      <div className="metric-grid">
        <div className="panel metric">
          <small>Outstanding principal</small>
          <strong>
            <Money value={l.outstanding} currency={l.loan.currency} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Interest paid</small>
          <strong>
            <Money value={l.interest_paid} currency={l.loan.currency} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Remaining payments</small>
          <strong>
            {l.remaining_months}
            <span> months</span>
          </strong>
        </div>
        <div className="panel metric">
          <small>Monthly EMI</small>
          <strong>
            <Money value={l.loan.emi!} currency={l.loan.currency} />
          </strong>
        </div>
      </div>
      <section className="panel">
        <SectionTitle
          title="Look how far you’ve come"
          action={<span className="badge income">{percent(l.progress)} repaid</span>}
        />
        <Progress value={l.progress} label="Principal repaid" />
        <div className="progress-label">
          <span>
            Original principal <Money value={l.loan.principal!} currency={l.loan.currency} />
          </span>
          <span>{percent(l.loan.rate_bps! / 100)} annual interest</span>
        </div>
      </section>
      <section className="panel">
        <SectionTitle
          title="Payment history"
          description="EMI payments split into principal and interest. Prepayments reduce principal directly."
        />
        {l.payments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...l.payments].reverse().map((p) => (
                  <tr key={p.id}>
                    <td>{displayDate(p.date)}</td>
                    <td>
                      <span className="badge">{p.kind}</span>
                    </td>
                    <td>
                      <Money value={p.principal} />
                    </td>
                    <td>
                      <Money value={p.interest} />
                    </td>
                    <td>
                      <Money value={p.amount} />
                    </td>
                    <td>
                      <DeleteButton path={`/loans/${id}/payments/${p.id}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted padded">Your first payment is a step worth recording.</p>
        )}
      </section>
      <section className="panel">
        <SectionTitle
          title="Amortization schedule"
          description="Monthly reducing-balance interest, rounded to the nearest paise. Forecast updates after each payment."
          action={<CalendarDays size={20} />}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {l.schedule.slice(0, limit).map((r, i) => (
                <tr key={`${r.date}-${i}`}>
                  <td>{displayDate(r.date)}</td>
                  <td>
                    <Money value={r.amount} currency={l.loan.currency} />
                  </td>
                  <td>
                    <Money value={r.principal} currency={l.loan.currency} />
                  </td>
                  <td>
                    <Money value={r.interest} currency={l.loan.currency} />
                  </td>
                  <td>
                    <Money value={r.balance} currency={l.loan.currency} />
                  </td>
                  <td>
                    <span className={`badge ${r.actual ? 'income' : ''}`}>
                      {r.actual ? 'Recorded' : 'Forecast'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {l.schedule.length > limit && (
          <button className="btn secondary load-more" onClick={() => setLimit((n) => n + 24)}>
            Show more payments
          </button>
        )}
      </section>
      <div className="info-card">
        <Landmark size={21} />
        <p>
          The forecast uses your configured EMI and monthly interest. Each recorded EMI accrues one
          month of interest; a prepayment accrues no interest. Your lender’s daily interest, fees,
          and payment dates may differ.
        </p>
      </div>
      <DeleteButton
        path={`/accounts/${id}`}
        label="Delete this loan"
        onDone={() => {
          window.location.href = '/loans';
        }}
      />
      {edit && <AccountDialog existing={l.loan} loan onClose={() => setEdit(false)} />}
      {pay && (
        <Dialog
          title="One step closer"
          submit="Record payment"
          onClose={() => setPay(false)}
          onSubmit={async (f) => {
            await save.mutateAsync({
              path: `/loans/${id}/payments`,
              body: {
                date: str(f, 'date'),
                amount: amount(f),
                kind: str(f, 'kind'),
                account_id: str(f, 'account_id'),
              },
            });
          }}
        >
          <Field label="Payment type">
            <select name="kind">
              <option value="emi">EMI · principal + interest</option>
              <option value="prepayment">Prepayment · principal only</option>
            </select>
          </Field>
          <AmountField
            value={Math.min(
              l.loan.emi!,
              l.outstanding + monthlyInterest(l.outstanding, l.loan.rate_bps!),
            )}
          />
          <Field label="Paid from">
            <select name="account_id" required>
              <option value="">Select an account</option>
              {data.accounts
                .filter((a) => !a.archived && a.type !== 'loan' && a.currency === l.loan.currency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Payment date">
            <input type="date" name="date" required defaultValue={today()} />
          </Field>
          <p className="hint">
            Payments create an expense transaction. Enter them in date order. Remove newer payments
            first if you need to correct an older one.
          </p>
        </Dialog>
      )}
    </>
  );
}
